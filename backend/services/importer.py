"""Import zadań z JSON (np. wygenerowanych przez AI): podgląd ze statusami i zapis w jednej transakcji.

Ta sama logika obsługuje okno „Importuj” (API) i skrypt scripts/import_seed.py.
"""
import json
import sqlite3
from datetime import datetime

from pydantic import ValidationError

from backend.api.errors import polish_message
from backend.api.schemas import TaskIn
from backend.repository import tasks as repo
from backend.services.tasks import create_task

MAX_TASKS = 100


class ImportFormatError(Exception):
    """Cały tekst nie nadaje się do importu — komunikat po polsku dla użytkownika."""


def preview_import(con: sqlite3.Connection, text: str) -> list[dict]:
    # 1. Odpowiedź z czatu bywa owinięta w blok kodu ```json … ``` — zdejmujemy go
    stripped = text.strip()
    if stripped.startswith("```") and stripped.endswith("```") and "\n" in stripped:
        stripped = stripped[stripped.index("\n") + 1:-3]

    # 2. Parsowanie — numer linii i kolumny pomaga znaleźć błąd w długim pliku
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as error:
        raise ImportFormatError(f"Nieprawidłowy JSON w linii {error.lineno}, kolumnie {error.colno}")
    except (ValueError, RecursionError):
        # Np. liczba ponad limit cyfr Pythona albo tysiące zagnieżdżonych nawiasów
        raise ImportFormatError("Nieprawidłowy JSON")
    # Samotne surogaty (np. "\ud800") nie dadzą się zapisać w bazie — odrzucamy cały tekst
    try:
        json.dumps(data, ensure_ascii=False).encode("utf-8")
    except UnicodeEncodeError:
        raise ImportFormatError("Tekst zawiera nieprawidłowe znaki Unicode")

    # 3. Pojedyncze zadanie traktujemy jak listę z jednym zadaniem
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ImportFormatError("Oczekiwano listy zadań")
    if not data:
        raise ImportFormatError("Brak zadań do importu")
    if len(data) > MAX_TASKS:
        raise ImportFormatError("Najwyżej 100 zadań naraz — podziel plik")

    # 4. Każde zadanie osobno: walidacja jak w formularzu, potem duplikaty (baza i wcześniejsze w pliku)
    items = []
    seen = set()
    for index, element in enumerate(data):
        if not isinstance(element, dict):
            items.append({"index": index, "title": None, "language": None, "status": "invalid",
                          "message": "To nie jest zadanie", "task": None})
            continue
        title = element.get("title") if isinstance(element.get("title"), str) else None
        language = element.get("language") if isinstance(element.get("language"), str) else None
        values = dict(element)
        values.setdefault("difficulty", "easy")
        try:
            task = TaskIn(**values).model_dump()
        except ValidationError as error:
            first = error.errors()[0]
            field = ".".join(str(part) for part in first["loc"])
            items.append({"index": index, "title": title, "language": language, "status": "invalid",
                          "message": f"{field}: {polish_message(first)}", "task": None})
            continue
        key = (task["title"], task["language"])        # tytuł już przycięty przez TaskIn
        if repo.task_exists(con, task["title"], task["language"]):
            items.append({"index": index, "title": title, "language": language, "status": "duplicate",
                          "message": "Już jest w bibliotece", "task": None})
        elif key in seen:
            items.append({"index": index, "title": title, "language": language, "status": "duplicate",
                          "message": "Powtórzone w pliku", "task": None})
        else:
            seen.add(key)
            items.append({"index": index, "title": title, "language": language, "status": "new",
                          "message": "", "task": task})
    return items


def import_tasks(con: sqlite3.Connection, tasks: list[dict], now: datetime) -> dict:
    # Wszystko albo nic: przy błędzie w połowie cofamy cały import
    imported = skipped = 0
    added = []
    try:
        for task in tasks:
            # Ktoś mógł dodać to samo zadanie między podglądem a importem
            if repo.task_exists(con, task["title"], task["language"]):
                skipped += 1
                continue
            create_task(con, task, now)
            imported += 1
            added.append({"title": task["title"], "language": task["language"]})
    except Exception:
        con.rollback()
        raise
    con.commit()
    return {"imported": imported, "skipped": skipped, "added": added}
