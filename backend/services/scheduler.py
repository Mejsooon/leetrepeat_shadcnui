"""Harmonogram powtórek (spec §4): nowy odstęp po ocenie, kolejka sesji, zapis oceny."""
import math
import sqlite3
from datetime import date, datetime, timedelta

from backend.repository import reviews as repo
from backend.repository import tasks as task_repo

RATINGS = ("again", "hard", "good", "easy")

# Odstęp dla zadania nowego (interval_days = 0) i mnożnik dla kolejnych powtórek
FIRST_INTERVAL = {"again": 0, "hard": 1, "good": 3, "easy": 7}
MULTIPLIER = {"hard": 1.2, "good": 2.5, "easy": 3.5}


def next_schedule(rating: str, interval_days: float, today: date) -> tuple[float, str]:
    if rating == "again":
        interval = 0
    elif interval_days == 0:
        interval = FIRST_INTERVAL[rating]
    else:
        interval = interval_days * MULTIPLIER[rating]
        if rating == "hard":
            interval = max(interval, interval_days + 1)     # „Trudne” zawsze co najmniej +1 dzień
    # Zaokrąglenie „od połowy w górę” (2,5 → 3), nie bankierskie round()
    days = math.floor(interval + 0.5)
    return interval, (today + timedelta(days=days)).isoformat()


def review_preview(con: sqlite3.Connection, task_id: int, today: date) -> list[dict] | None:
    row = repo.get_schedule(con, task_id)
    if row is None:
        return None
    result = []
    for rating in RATINGS:
        interval, due_date = next_schedule(rating, row["interval_days"], today)
        result.append({"rating": rating, "interval_days": interval, "due_date": due_date})
    return result


def submit_review(con: sqlite3.Connection, task_id: int, data: dict, now: datetime) -> dict | None:
    row = repo.get_schedule(con, task_id)
    if row is None:
        return None
    interval, due_date = next_schedule(data["rating"], row["interval_days"], now.date())
    repo.insert_review(con, task_id, data, now.isoformat(timespec="seconds"))
    repo.set_schedule(con, task_id, interval, due_date)
    return {"interval_days": interval, "due_date": due_date}


def session_queue(con: sqlite3.Connection, today: date, language: str | None = None) -> list[dict]:
    rows = repo.session_rows(con, today.isoformat(), language)
    tags = task_repo.get_tags_for_tasks(con, [row["id"] for row in rows])
    return [{"id": row["id"], "title": row["title"], "language": row["language"], "difficulty": row["difficulty"],
             "tags": tags[row["id"]], "status": "due" if row["reviewed"] else "new"} for row in rows]
