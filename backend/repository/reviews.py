"""SQL dla ocen i harmonogramu. Bez decyzji — tylko odczyt i zapis gotowych wartości."""
import sqlite3


def insert_review(con: sqlite3.Connection, task_id: int, values: dict, reviewed_at: str) -> None:
    con.execute(
        """INSERT INTO reviews (task_id, rating, reviewed_at, duration_seconds, tests_passed, tests_total,
                                hint_used, solution_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (task_id, values["rating"], reviewed_at, values["duration_seconds"], values["tests_passed"],
         values["tests_total"], int(values["hint_used"]), int(values["solution_used"])))


def set_schedule(con: sqlite3.Connection, task_id: int, interval_days: float, due_date: str) -> None:
    con.execute("UPDATE tasks SET interval_days = ?, due_date = ? WHERE id = ?", (interval_days, due_date, task_id))


def get_schedule(con: sqlite3.Connection, task_id: int) -> sqlite3.Row | None:
    return con.execute("SELECT interval_days FROM tasks WHERE id = ?", (task_id,)).fetchone()


def session_rows(con: sqlite3.Connection, today: str, language: str | None) -> list[sqlite3.Row]:
    # Najpierw „Do powtórki” (najstarszy termin), potem „Nowe” (najstarsze utworzone)
    return con.execute(
        """SELECT * FROM (
               SELECT t.id, t.title, t.language, t.difficulty, t.due_date, t.created_at,
                      EXISTS (SELECT 1 FROM reviews r WHERE r.task_id = t.id) AS reviewed
               FROM tasks t
               WHERE (? IS NULL OR t.language = ?)
           )
           WHERE (reviewed = 1 AND due_date <= ?) OR reviewed = 0
           -- reviewed DESC dzieli wynik na dwie grupy (najpierw oceniane, potem nowe), więc CASE
           -- porównuje due_date tylko z due_date, a created_at tylko z created_at
           ORDER BY reviewed DESC,
                    CASE WHEN reviewed = 1 THEN due_date ELSE created_at END,
                    id""",
        (language, language, today)).fetchall()
