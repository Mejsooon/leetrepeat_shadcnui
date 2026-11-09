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


def stats(con: sqlite3.Connection, start: date, end: date, today: date) -> dict:
    rows = repo.period_reviews(con, start.isoformat(), end.isoformat())
    streak, longest = streaks(repo.review_days(con), today)

    # Dni okresu (rosnąco), wypełnione zerami
    period_days = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    daily = {day: {"date": day, "python": 0, "csharp": 0} for day in period_days}
    day_totals = {day: [0, 0] for day in period_days}                      # [udane, wszystkie]

    by_language = {lang: 0 for lang in LANGUAGES}
    success_by_language = {lang: {"successful": 0, "total": 0} for lang in LANGUAGES}
    durations = {lang: [] for lang in LANGUAGES}
    per_task: dict[int, dict] = {}

    for row in rows:
        lang = row["language"]
        ok = row["rating"] != "again"                                      # udana powtórka = ocena ≠ „Znowu”
        by_language[lang] += 1
        success_by_language[lang]["total"] += 1
        success_by_language[lang]["successful"] += int(ok)
        durations[lang].append(row["duration_seconds"])
        daily[row["day"]][lang] += 1
        day_totals[row["day"]][0] += int(ok)
        day_totals[row["day"]][1] += 1
        task = per_task.setdefault(row["task_id"], {"id": row["task_id"], "title": row["title"], "language": lang,
                                                    "successful": 0, "total": 0})
        task["successful"] += int(ok)
        task["total"] += 1

    total = sum(by_language.values())
    successful = sum(s["successful"] for s in success_by_language.values())
    all_durations = durations["python"] + durations["csharp"]

    # Zadania wymagające uwagi: min. 3 oceny w okresie i skuteczność < 100%
    weak = [t for t in per_task.values() if t["total"] >= 3 and t["successful"] < t["total"]]
    weak.sort(key=lambda t: (t["successful"] / t["total"], -t["total"], t["title"]))

    recent_days = []
    for day in reversed(period_days[-4:]):
        ok, count = day_totals[day]
        recent_days.append({"date": day, "count": count, "success_rate": ok / count if count else None})

    return {
        "reviews_count": total,
        "by_language": by_language,
        "success_rate": successful / total if total else None,
        "success_by_language": success_by_language,
        "avg_duration_s": sum(all_durations) / len(all_durations) if all_durations else None,
        "avg_duration_by_language": {lang: sum(d) / len(d) if d else None for lang, d in durations.items()},
        "streak": streak,
        "longest_streak": longest,
        "daily": list(daily.values()),
        "weak_tasks": weak[:4],
        "recent_days": recent_days,
    }
