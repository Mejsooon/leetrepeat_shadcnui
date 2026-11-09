import sqlite3

import pytest

from backend.core.database import connect


def test_all_tables_exist(db):
    names = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"tasks", "tags", "task_tags", "tests", "reviews", "settings"} <= names


def test_tasks_columns(db):
    cols = {r["name"] for r in db.execute("PRAGMA table_info(tasks)")}
    assert cols == {"id", "title", "language", "kind", "difficulty", "description", "starter_code",
                    "hint", "solution", "notes", "created_at", "updated_at", "interval_days", "due_date"}


def test_reviews_columns(db):
    cols = {r["name"] for r in db.execute("PRAGMA table_info(reviews)")}
    assert cols == {"id", "task_id", "rating", "reviewed_at", "duration_seconds", "tests_passed",
                    "tests_total", "hint_used", "solution_used"}


def test_tag_names_unique_case_insensitive(db):
    db.execute("INSERT INTO tags(name) VALUES ('Tablice')")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO tags(name) VALUES ('tablice')")


def test_deleting_task_cascades(db):
    db.execute("""INSERT INTO tasks(id, title, language, kind, difficulty, description, solution,
                  created_at, updated_at, due_date)
                  VALUES (1, 'Two Sum', 'python', 'function', 'easy', 'opis', 'kod',
                  '2026-11-09T10:00:00', '2026-11-09T10:00:00', '2026-11-09')""")
    db.execute("INSERT INTO tests(task_id, position, input, expected) VALUES (1, 0, 'f()', '1')")
    db.execute("INSERT INTO tags(id, name) VALUES (1, 'Tablice')")
    db.execute("INSERT INTO task_tags(task_id, tag_id) VALUES (1, 1)")
    db.execute("""INSERT INTO reviews(task_id, rating, reviewed_at, duration_seconds, hint_used, solution_used)
                  VALUES (1, 'good', '2026-11-09T10:05:00', 272, 0, 0)""")
    db.execute("DELETE FROM tasks WHERE id = 1")
    assert db.execute("SELECT COUNT(*) FROM tests").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM task_tags").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0


def test_connect_twice_keeps_data(tmp_path):
    path = str(tmp_path / "baza.db")
    con = connect(path)
    con.execute("INSERT INTO settings(key, value) VALUES ('python_timeout_s', '5')")
    con.commit()
    con.close()
    con = connect(path)
    assert con.execute("SELECT value FROM settings WHERE key = 'python_timeout_s'").fetchone()[0] == "5"
    con.close()
