"""Endpointy HTTP pod /api. Każdy przyjmuje dane, woła serwis i zwraca odpowiedź."""
from fastapi import APIRouter

VERSION = "3.0.0"


def create_router(db_path: str) -> APIRouter:
    router = APIRouter(prefix="/api")

    # Frontend sprawdza tym, czy serwer działa (baner „Nie można połączyć się z aplikacją”)
    @router.get("/health")
    def health():
        return {"status": "ok", "version": VERSION}

    return router
