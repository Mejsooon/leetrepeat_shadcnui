"""SQL dla Pulpitu i Statystyk. Tylko zliczanie i odczyt — reguły są w services/stats.py."""
import sqlite3


def review_days(con: sqlite3.Connection) -> list[str]:
    # Dni (RRRR-MM-DD), w których była co najmniej jedna ocena
    rows = con.execute("SELECT DISTINCT substr(reviewed_at, 1, 10) AS day FROM reviews ORDER BY day").fetchall()
    return [row["day"] for row in rows]


def library_rows(con: sqlite3.Connection, language: str | None) -> list[sqlite3.Row]:
    return con.execute(
        """SELECT t.language, t.interval_days, t.due_date,
                  EXISTS (SELECT 1 FROM reviews r WHERE r.task_id = t.id) AS reviewed
           FROM tasks t
           WHERE (? IS NULL OR t.language = ?)""",
        (language, language)).fetchall()


def completed_today(con: sqlite3.Connection, today: str, language: str | None) -> int:
    # Ile różnych zadań oceniono danego dnia
    return con.execute(
        """SELECT COUNT(DISTINCT r.task_id) FROM reviews r JOIN tasks t ON t.id = r.task_id
           WHERE substr(r.reviewed_at, 1, 10) = ? AND (? IS NULL OR t.language = ?)""",
        (today, language, language)).fetchone()[0]


def upcoming_rows(con: sqlite3.Connection, today: str, language: str | None, limit: int) -> list[sqlite3.Row]:
    # Najbliższe przyszłe powtórki (tylko zadania z ocenami)
    return con.execute(
        """SELECT t.id, t.title, t.language, t.difficulty, t.due_date FROM tasks t
           WHERE t.due_date > ? AND EXISTS (SELECT 1 FROM reviews r WHERE r.task_id = t.id)
             AND (? IS NULL OR t.language = ?)
           ORDER BY t.due_date, t.id
           LIMIT ?""",
        (today, language, language, limit)).fetchall()


def due_dates(con: sqlite3.Connection, task_ids: list[int]) -> dict[int, str]:
    if not task_ids:
        return {}
    marks = ",".join("?" * len(task_ids))
    rows = con.execute(f"SELECT id, due_date FROM tasks WHERE id IN ({marks})", task_ids).fetchall()
    return {row["id"]: row["due_date"] for row in rows}


def period_reviews(con: sqlite3.Connection, start: str, end: str) -> list[sqlite3.Row]:
    # Oceny z dniem w [start, end] (włącznie) z danymi zadania
    return con.execute(
        """SELECT r.task_id, t.title, t.language, r.rating, r.duration_seconds,
                  substr(r.reviewed_at, 1, 10) AS day
           FROM reviews r JOIN tasks t ON t.id = r.task_id
           WHERE substr(r.reviewed_at, 1, 10) BETWEEN ? AND ?""",
        (start, end)).fetchall()
