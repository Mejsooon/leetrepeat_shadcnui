"""Cały SQL dla zadań, testów i tagów. Bez decyzji — tylko odczyt i zapis gotowych wartości."""
import sqlite3

TASK_COLUMNS = ("title", "language", "kind", "difficulty", "description", "starter_code", "hint", "solution")


def insert_task(con: sqlite3.Connection, values: dict, created_at: str, due_date: str) -> int:
    cursor = con.execute(
        """INSERT INTO tasks (title, language, kind, difficulty, description, starter_code, hint, solution,
                              notes, created_at, updated_at, interval_days, due_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 0, ?)""",
        (*[values[c] for c in TASK_COLUMNS], created_at, created_at, due_date))
    return cursor.lastrowid


def update_task(con: sqlite3.Connection, task_id: int, values: dict, updated_at: str) -> bool:
    # Harmonogram (interval_days, due_date) i notatki zostają bez zmian
    cursor = con.execute(
        """UPDATE tasks SET title = ?, language = ?, kind = ?, difficulty = ?, description = ?,
                            starter_code = ?, hint = ?, solution = ?, updated_at = ?
           WHERE id = ?""",
        (*[values[c] for c in TASK_COLUMNS], updated_at, task_id))
    return cursor.rowcount > 0


def replace_tests(con: sqlite3.Connection, task_id: int, tests: list[dict]) -> None:
    con.execute("DELETE FROM tests WHERE task_id = ?", (task_id,))
    for position, test in enumerate(tests):
        con.execute("INSERT INTO tests (task_id, position, input, expected) VALUES (?, ?, ?, ?)",
                    (task_id, position, test["input"], test["expected"]))


def get_task(con: sqlite3.Connection, task_id: int) -> sqlite3.Row | None:
    return con.execute(
        """SELECT t.*,
                  (SELECT COUNT(*) FROM reviews r WHERE r.task_id = t.id) AS review_count,
                  (SELECT MAX(reviewed_at) FROM reviews r WHERE r.task_id = t.id) AS last_reviewed_at
           FROM tasks t WHERE t.id = ?""", (task_id,)).fetchone()


def get_tests(con: sqlite3.Connection, task_id: int) -> list[sqlite3.Row]:
    return con.execute("SELECT input, expected FROM tests WHERE task_id = ? ORDER BY position", (task_id,)).fetchall()


def get_tags_for_tasks(con: sqlite3.Connection, task_ids: list[int]) -> dict[int, list[str]]:
    result = {task_id: [] for task_id in task_ids}
    if not task_ids:
        return result
    marks = ",".join("?" * len(task_ids))
    rows = con.execute(
        f"""SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
            WHERE tt.task_id IN ({marks}) ORDER BY pylower(g.name)""", task_ids).fetchall()
    for row in rows:
        result[row["task_id"]].append(row["name"])
    return result


def delete_task(con: sqlite3.Connection, task_id: int) -> bool:
    return con.execute("DELETE FROM tasks WHERE id = ?", (task_id,)).rowcount > 0


def update_notes(con: sqlite3.Connection, task_id: int, notes: str) -> bool:
    return con.execute("UPDATE tasks SET notes = ? WHERE id = ?", (notes, task_id)).rowcount > 0


def all_tags(con: sqlite3.Connection) -> list[sqlite3.Row]:
    return con.execute("SELECT id, name FROM tags").fetchall()


def insert_tag(con: sqlite3.Connection, name: str) -> int:
    return con.execute("INSERT INTO tags (name) VALUES (?)", (name,)).lastrowid


def set_task_tags(con: sqlite3.Connection, task_id: int, tag_ids: list[int]) -> None:
    con.execute("DELETE FROM task_tags WHERE task_id = ?", (task_id,))
    for tag_id in tag_ids:
        con.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", (task_id, tag_id))


def delete_orphan_tags(con: sqlite3.Connection) -> None:
    con.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM task_tags)")


def list_tags(con: sqlite3.Connection) -> list[sqlite3.Row]:
    return con.execute(
        """SELECT g.name, COUNT(tt.task_id) AS count FROM tags g JOIN task_tags tt ON tt.tag_id = g.id
           GROUP BY g.id ORDER BY pylower(g.name)""").fetchall()


def list_tasks(con: sqlite3.Connection, today: str, q: str, language: str | None, difficulty: str | None,
               status: str | None, tag: str | None, limit: int, offset: int) -> tuple[list[sqlite3.Row], int]:
    # Warunki WHERE składane z filtrów, które użytkownik ustawił
    where = []
    params: list = []
    if q:
        # % i _ to w LIKE wieloznaczniki — uciekamy je, żeby „100%” szukało dosłownie
        escaped = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(pylower(t.title) LIKE ? ESCAPE '\\' OR pylower(t.description) LIKE ? ESCAPE '\\')")
        params += [f"%{escaped}%", f"%{escaped}%"]
    if language:
        where.append("t.language = ?")
        params.append(language)
    if difficulty:
        where.append("t.difficulty = ?")
        params.append(difficulty)
    if tag:
        where.append("""EXISTS (SELECT 1 FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
                                WHERE tt.task_id = t.id AND pylower(g.name) = pylower(?))""")
        params.append(tag)
    reviewed = "EXISTS (SELECT 1 FROM reviews r WHERE r.task_id = t.id)"
    if status == "new":
        where.append(f"NOT {reviewed}")
    elif status == "due":
        where.append(f"{reviewed} AND t.due_date <= ?")
        params.append(today)
    elif status == "learning":
        where.append(f"{reviewed} AND t.due_date > ? AND t.interval_days < 21")
        params.append(today)
    elif status == "consolidated":
        where.append(f"{reviewed} AND t.due_date > ? AND t.interval_days >= 21")
        params.append(today)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    total = con.execute(f"SELECT COUNT(*) FROM tasks t {where_sql}", params).fetchone()[0]
    rows = con.execute(
        f"""SELECT t.id, t.title, t.language, t.difficulty, t.due_date, t.interval_days,
                   (SELECT COUNT(*) FROM reviews r WHERE r.task_id = t.id) AS review_count
            FROM tasks t {where_sql} ORDER BY t.due_date, t.id LIMIT ? OFFSET ?""",
        [*params, limit, offset]).fetchall()
    return rows, total


def library_counts(con: sqlite3.Connection, today: str) -> dict:
    row = con.execute(
        """SELECT COUNT(*) AS library,
                  SUM(CASE WHEN EXISTS (SELECT 1 FROM reviews r WHERE r.task_id = t.id) AND t.due_date <= ?
                           THEN 1 ELSE 0 END) AS due,
                  SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM reviews r WHERE r.task_id = t.id)
                           THEN 1 ELSE 0 END) AS new
           FROM tasks t""", (today,)).fetchone()
    return {"library": row["library"], "due": row["due"] or 0, "new": row["new"] or 0}


def task_exists(con: sqlite3.Connection, title: str, language: str) -> bool:
    return con.execute("SELECT 1 FROM tasks WHERE title = ? AND language = ?", (title, language)).fetchone() is not None
