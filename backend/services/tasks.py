"""Logika zadań: daty, status (spec §4), porządkowanie tagów. SQL jest w repository/tasks.py."""
import math
import sqlite3
from datetime import date, datetime

from backend.repository import tasks as repo

CONSOLIDATED_DAYS = 21          # od tylu dni odstępu zadanie jest „Utrwalone”


def task_status(review_count: int, due_date: str, interval_days: float, today: date) -> str:
    if review_count == 0:
        return "new"
    if due_date <= today.isoformat():
        return "due"
    if interval_days >= CONSOLIDATED_DAYS:
        return "consolidated"
    return "learning"


def _save_tags(con: sqlite3.Connection, task_id: int, names: list[str]) -> None:
    # Tagi: bez spacji na końcach, bez pustych, bez powtórzeń niezależnie od wielkości liter.
    # Istniejący tag dopasowujemy po casefold (działa z „Ł”/„ł”), zostaje pisownia pierwszego użycia.
    existing = {row["name"].casefold(): row["id"] for row in repo.all_tags(con)}
    tag_ids = []
    for name in names:
        name = name.strip()
        if not name:
            continue
        key = name.casefold()
        if key not in existing:
            existing[key] = repo.insert_tag(con, name)
        if existing[key] not in tag_ids:
            tag_ids.append(existing[key])
    repo.set_task_tags(con, task_id, tag_ids)
    repo.delete_orphan_tags(con)


def create_task(con: sqlite3.Connection, data: dict, now: datetime) -> int:
    task_id = repo.insert_task(con, data, now.isoformat(timespec="seconds"), now.date().isoformat())
    repo.replace_tests(con, task_id, data["tests"])
    _save_tags(con, task_id, data.get("tags", []))
    return task_id


def update_task(con: sqlite3.Connection, task_id: int, data: dict, now: datetime) -> bool:
    if not repo.update_task(con, task_id, data, now.isoformat(timespec="seconds")):
        return False
    repo.replace_tests(con, task_id, data["tests"])
    _save_tags(con, task_id, data.get("tags", []))
    return True


def get_task(con: sqlite3.Connection, task_id: int, today: date) -> dict | None:
    row = repo.get_task(con, task_id)
    if row is None:
        return None
    task = dict(row)
    task["status"] = task_status(task.pop("review_count"), task["due_date"], task["interval_days"], today)
    task["tests"] = [dict(t) for t in repo.get_tests(con, task_id)]
    task["tags"] = repo.get_tags_for_tasks(con, [task_id])[task_id]
    return task


def delete_task(con: sqlite3.Connection, task_id: int) -> bool:
    deleted = repo.delete_task(con, task_id)
    repo.delete_orphan_tags(con)
    return deleted


def update_notes(con: sqlite3.Connection, task_id: int, notes: str) -> bool:
    return repo.update_notes(con, task_id, notes)


def list_tasks(con: sqlite3.Connection, today: date, q: str = "", language: str | None = None,
               difficulty: str | None = None, status: str | None = None, tag: str | None = None,
               page: int = 1, page_size: int = 10) -> dict:
    rows, total = repo.list_tasks(con, today.isoformat(), q.strip(), language, difficulty, status, tag,
                                  page_size, (page - 1) * page_size)
    tags = repo.get_tags_for_tasks(con, [row["id"] for row in rows])
    items = [{
        "id": row["id"], "title": row["title"], "tags": tags[row["id"]], "language": row["language"],
        "difficulty": row["difficulty"], "due_date": row["due_date"],
        "status": task_status(row["review_count"], row["due_date"], row["interval_days"], today),
    } for row in rows]
    return {"items": items, "total": total, "page": page, "pages": max(1, math.ceil(total / page_size)),
            "counts": repo.library_counts(con, today.isoformat())}


def list_tags(con: sqlite3.Connection) -> list[dict]:
    return [{"name": row["name"], "count": row["count"]} for row in repo.list_tags(con)]
