"""Endpointy HTTP pod /api. Każdy otwiera bazę, woła serwis i zwraca odpowiedź."""
import os
import tempfile
import time
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from backend.api.schemas import ImportIn, ImportPreviewIn, NotesIn, ReviewIn, RunIn, SettingsIn, TaskIn
from backend.core.database import connect
from backend.services import backup as backup_service
from backend.services import importer
from backend.services import scheduler
from backend.services import settings as settings_service
from backend.services import stats as stats_service
from backend.services import tasks as task_service
from backend.services.runner import RuntimeMissing, run_tests

VERSION = "3.0.0"
NOT_FOUND = "Nie znaleziono zadania"


def create_router(db_path: str) -> APIRouter:
    router = APIRouter(prefix="/api")

    # Frontend sprawdza tym, czy serwer działa (baner „Nie można połączyć się z aplikacją”)
    @router.get("/health")
    def health():
        return {"status": "ok", "version": VERSION}

    @router.get("/tasks")
    def list_tasks(q: str = "",
                   language: Literal["python", "csharp"] | None = None,
                   difficulty: Literal["easy", "medium", "hard"] | None = None,
                   status: Literal["new", "due", "learning", "consolidated"] | None = None,
                   tag: str | None = None,
                   page: int = Query(1, ge=1),
                   page_size: int = Query(10, ge=1, le=100)):
        con = connect(db_path)
        try:
            return task_service.list_tasks(con, date.today(), q, language, difficulty, status, tag, page, page_size)
        finally:
            con.close()

    @router.get("/tasks/{task_id}")
    def get_task(task_id: int):
        con = connect(db_path)
        try:
            task = task_service.get_task(con, task_id, date.today())
        finally:
            con.close()
        if task is None:
            raise HTTPException(404, NOT_FOUND)
        return task

    @router.post("/tasks", status_code=201)
    def create_task(body: TaskIn):
        con = connect(db_path)
        try:
            task_id = task_service.create_task(con, body.model_dump(), datetime.now().replace(microsecond=0))
            con.commit()
        finally:
            con.close()
        return {"id": task_id}

    # Import zadań z JSON (np. od AI): najpierw podgląd ze statusami, potem zapis zaznaczonych
    @router.post("/import/preview")
    def import_preview(body: ImportPreviewIn):
        if len(body.text.encode("utf-8")) > 1_048_576:
            raise HTTPException(413, "Tekst jest za duży (najwyżej 1 MB)")
        con = connect(db_path)
        try:
            items = importer.preview_import(con, body.text)
        except importer.ImportFormatError as error:
            raise HTTPException(422, str(error))
        finally:
            con.close()
        return {"items": items}

    @router.post("/import", status_code=201)
    def import_tasks(body: ImportIn):
        con = connect(db_path)
        try:
            return importer.import_tasks(con, [task.model_dump() for task in body.tasks],
                                         datetime.now().replace(microsecond=0))
        finally:
            con.close()

    @router.put("/tasks/{task_id}")
    def update_task(task_id: int, body: TaskIn):
        con = connect(db_path)
        try:
            updated = task_service.update_task(con, task_id, body.model_dump(), datetime.now().replace(microsecond=0))
            con.commit()
        finally:
            con.close()
        if not updated:
            raise HTTPException(404, NOT_FOUND)
        return {"id": task_id}

    @router.patch("/tasks/{task_id}/notes")
    def update_notes(task_id: int, body: NotesIn):
        con = connect(db_path)
        try:
            updated = task_service.update_notes(con, task_id, body.notes)
            con.commit()
        finally:
            con.close()
        if not updated:
            raise HTTPException(404, NOT_FOUND)
        return {"ok": True}

    @router.delete("/tasks/{task_id}", status_code=204)
    def delete_task(task_id: int):
        con = connect(db_path)
        try:
            deleted = task_service.delete_task(con, task_id)
            con.commit()
        finally:
            con.close()
        if not deleted:
            raise HTTPException(404, NOT_FOUND)
        return Response(status_code=204)

    @router.get("/tags")
    def list_tags():
        con = connect(db_path)
        try:
            return task_service.list_tags(con)
        finally:
            con.close()

    # Pulpit: liczby, kolejka na dziś, postęp według języka
    @router.get("/dashboard")
    def dashboard(language: Literal["python", "csharp"] | None = None):
        con = connect(db_path)
        try:
            return stats_service.dashboard(con, date.today(), language)
        finally:
            con.close()

    # Statystyki okresu [from, to] włącznie; domyślnie ostatnie 14 dni
    @router.get("/stats")
    def stats(from_: date | None = Query(None, alias="from"), to: date | None = None):
        if from_ is None and to is None:
            to = date.today()
        if to is None:
            to = from_ + timedelta(days=13)
        if from_ is None:
            from_ = to - timedelta(days=13)
        if from_ > to:
            raise HTTPException(422, "Początek okresu jest po jego końcu")
        if (to - from_).days + 1 > 366:
            raise HTTPException(422, "Okres może mieć najwyżej 366 dni")
        con = connect(db_path)
        try:
            return stats_service.stats(con, from_, to, date.today())
        finally:
            con.close()

    # Ustawienia: ścieżki i limity Pythona / .NET
    @router.get("/settings")
    def get_settings():
        con = connect(db_path)
        try:
            return settings_service.get_settings(con, db_path)
        finally:
            con.close()

    @router.put("/settings")
    def put_settings(body: SettingsIn):
        con = connect(db_path)
        try:
            result = settings_service.save_settings(con, body.model_dump(), db_path)
            con.commit()
            return result
        finally:
            con.close()

    @router.get("/settings/runtimes")
    def runtimes():
        con = connect(db_path)
        try:
            return settings_service.check_runtimes(con)
        finally:
            con.close()

    # Kopia zapasowa: spójna kopia bazy jako plik do pobrania
    @router.get("/backup")
    def download_backup():
        fd, temp_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            backup_service.export_copy(db_path, temp_path)
        except Exception:
            os.remove(temp_path)          # nieudana kopia nie zostawia śmieci w katalogu tymczasowym
            raise
        now = datetime.now()
        con = connect(db_path)
        try:
            settings_service.mark_backup(con, now)
            con.commit()
        finally:
            con.close()
        return FileResponse(temp_path, media_type="application/octet-stream",
                            filename=f"leetrepeat-{now.date().isoformat()}.db",
                            background=BackgroundTask(os.remove, temp_path))

    # Przywrócenie: ciało żądania = bajty pliku .db; zły plik → 409, dane nietknięte
    @router.post("/backup/restore")
    async def restore_backup(request: Request):
        # Za duży plik odrzucamy po nagłówku, zanim całe ciało trafi do pamięci
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > backup_service.MAX_RESTORE_BYTES:
            raise HTTPException(413, "Plik jest za duży")
        data = await request.body()
        if len(data) > backup_service.MAX_RESTORE_BYTES:
            raise HTTPException(413, "Plik jest za duży")
        try:
            return await run_in_threadpool(backup_service.restore, db_path, data, datetime.now())
        except ValueError as error:
            raise HTTPException(409, str(error))

    # Kolejka sesji: najpierw „Do powtórki”, potem „Nowe” (spec §4)
    @router.get("/session")
    def session(language: Literal["python", "csharp"] | None = None):
        con = connect(db_path)
        try:
            return scheduler.session_queue(con, date.today(), language)
        finally:
            con.close()

    # Uruchamia kod użytkownika na tym komputerze — chronione przez Host i Origin (main.py)
    @router.post("/run")
    def run(body: RunIn):
        tests = [test.model_dump() for test in body.tests]
        con = connect(db_path)
        try:
            options = settings_service.runner_options(con, body.language)     # ścieżki i limity z Ustawień
        finally:
            con.close()
        started = time.perf_counter()
        try:
            results = run_tests(body.language, body.kind, body.code, tests, **options)
        except RuntimeMissing as error:
            raise HTTPException(503, str(error))
        return {"results": results, "duration_ms": round((time.perf_counter() - started) * 1000)}

    @router.get("/tasks/{task_id}/review-preview")
    def review_preview(task_id: int):
        con = connect(db_path)
        try:
            preview = scheduler.review_preview(con, task_id, date.today())
        finally:
            con.close()
        if preview is None:
            raise HTTPException(404, NOT_FOUND)
        return preview

    @router.post("/tasks/{task_id}/review")
    def review(task_id: int, body: ReviewIn):
        con = connect(db_path)
        try:
            result = scheduler.submit_review(con, task_id, body.model_dump(), datetime.now().replace(microsecond=0))
            con.commit()
        finally:
            con.close()
        if result is None:
            raise HTTPException(404, NOT_FOUND)
        return result

    return router
