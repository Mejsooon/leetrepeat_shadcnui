"""Endpointy HTTP pod /api. Każdy otwiera bazę, woła serwis i zwraca odpowiedź."""
import time
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response

from backend.api.schemas import NotesIn, ReviewIn, RunIn, TaskIn
from backend.core.database import connect
from backend.services import scheduler
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
        started = time.perf_counter()
        try:
            results = run_tests(body.language, body.kind, body.code, tests)
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
