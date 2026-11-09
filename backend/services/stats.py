"""Pulpit i Statystyki (spec §4 „Pojęcia wyliczane”, §5 /dashboard i /stats)."""
import sqlite3
from datetime import date, timedelta

from backend.repository import stats as repo
from backend.services.scheduler import session_queue
from backend.services.tasks import CONSOLIDATED_DAYS

LANGUAGES = ("python", "csharp")


def streaks(days: list[str], today: date) -> tuple[int, int]:
    """(seria, najdłuższa seria). Seria liczona wstecz od dziś, a gdy dziś brak ocen — od wczoraj."""
    day_set = set(days)

    # Bieżąca seria
    current = today if today.isoformat() in day_set else today - timedelta(days=1)
    streak = 0
    while current.isoformat() in day_set:
        streak += 1
        current -= timedelta(days=1)

    # Najdłuższa seria w całej historii (dni są posortowane rosnąco)
    longest = 0
    run = 0
    previous = None
    for day in sorted(day_set):
        current_day = date.fromisoformat(day)
        run = run + 1 if previous is not None and current_day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = current_day
    return streak, longest


def dashboard(con: sqlite3.Connection, today: date, language: str | None = None) -> dict:
    today_iso = today.isoformat()
    streak, longest = streaks(repo.review_days(con), today)

    # Liczniki i postęp według języka — jedno przejście po bibliotece
    due_by_language = {lang: 0 for lang in LANGUAGES}
    library_by_language = {lang: 0 for lang in LANGUAGES}
    progress = {lang: {"language": lang, "consolidated": 0, "learning": 0, "new": 0} for lang in LANGUAGES}
    new_count = 0
    for row in repo.library_rows(con, language):
        lang = row["language"]
        library_by_language[lang] += 1
        if not row["reviewed"]:
            new_count += 1
            progress[lang]["new"] += 1
            continue
        if row["due_date"] <= today_iso:
            due_by_language[lang] += 1
        # Postęp liczony po odstępie, niezależnie od terminu (zadania „Do powtórki” są „w nauce”)
        if row["interval_days"] >= CONSOLIDATED_DAYS:
            progress[lang]["consolidated"] += 1
        else:
            progress[lang]["learning"] += 1

    # Kolejka: pierwsze 3 z sesji; gdy sesja pusta — 3 najbliższe przyszłe powtórki
    session = session_queue(con, today, language)
    due_dates = repo.due_dates(con, [item["id"] for item in session[:3]])
    if session:
        queue = [{"id": item["id"], "title": item["title"], "language": item["language"],
                  "difficulty": item["difficulty"], "due_date": due_dates[item["id"]]} for item in session[:3]]
        queue_rest = [item["title"] for item in session[3:]]
    else:
        queue = [dict(row) for row in repo.upcoming_rows(con, today_iso, language, 3)]
        queue_rest = []

    upcoming = repo.upcoming_rows(con, today_iso, language, 1)
    return {
        "due_count": sum(due_by_language.values()),
        "due_by_language": due_by_language,
        "new_count": new_count,
        "streak": streak,
        "longest_streak": longest,
        "library_count": sum(library_by_language.values()),
        "library_by_language": library_by_language,
        "queue": queue,
        "queue_rest": queue_rest,
        "session_count": len(session),
        "progress_by_language": [progress[lang] for lang in LANGUAGES],
        "next_review_date": upcoming[0]["due_date"] if upcoming else None,
        "completed_today": repo.completed_today(con, today_iso, language),
    }
