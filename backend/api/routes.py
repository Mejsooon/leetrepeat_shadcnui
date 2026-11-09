"""Endpointy HTTP pod /api. Każdy otwiera bazę, woła serwis i zwraca odpowiedź."""
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response

from backend.api.schemas import NotesIn, TaskIn
from backend.core.database import connect
from backend.services import tasks as task_service

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

    return router
