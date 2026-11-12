import os
import sqlite3
import subprocess
import sys
from datetime import date, datetime

import pytest

from backend.core.database import connect
from backend.services.tasks import get_task, list_tags, list_tasks
from scripts.import_seed import import_seed
from scripts.import_v2 import import_v2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = datetime(2026, 11, 9, 10, 0)
TODAY = date(2026, 11, 9)

# Schemat bazy LeetRepeat v2 (repo Mejsooon/leetrepeat, core/database.py)
V2_SCHEMA = """
CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, language TEXT NOT NULL, kind TEXT NOT NULL,
    description TEXT NOT NULL, starter_code TEXT NOT NULL DEFAULT '', hint TEXT NOT NULL DEFAULT '',
    solution TEXT NOT NULL, created_at TEXT NOT NULL, interval_days REAL NOT NULL DEFAULT 0, due_date TEXT NOT NULL);
CREATE TABLE tests (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, input TEXT NOT NULL, expected TEXT NOT NULL);
CREATE TABLE reviews (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    rating TEXT NOT NULL, reviewed_at TEXT NOT NULL, tests_passed INTEGER, tests_total INTEGER,
    hint_used INTEGER NOT NULL, solution_used INTEGER NOT NULL, prev_interval_days REAL, prev_due_date TEXT);
"""


@pytest.fixture
def old_db(tmp_path):
    path = str(tmp_path / "stara.db")
    con = sqlite3.connect(path)
    con.executescript(V2_SCHEMA)
    con.execute("""INSERT INTO tasks VALUES (1, 'Odwracanie', 'python', 'function', 'Odwróć listę.', 'def odwroc(l):\n    pass\n',
                   'Wycinki', 'def odwroc(l):\n    return l[::-1]\n', '2026-11-01T10:00:00', 7.5, '2026-11-15')""")
    con.execute("INSERT INTO tests VALUES (1, 1, 1, 'odwroc([1,2])', '[2,1]')")
    con.execute("INSERT INTO tests VALUES (2, 1, 0, 'odwroc([])', '[]')")
    con.execute("""INSERT INTO tasks VALUES (2, 'Podwajanie', 'csharp', 'program', 'Podwój liczbę.', '', '',
                   'int x = int.Parse(Console.ReadLine()); Console.WriteLine(x*2);', '2026-11-02T10:00:00', 0, '2026-11-02')""")
    con.execute("INSERT INTO tests VALUES (3, 2, 0, '4', '8')")
    con.execute("INSERT INTO reviews VALUES (1, 1, 'good', '2026-11-08T10:00:00', 2, 2, 0, 0, 3, '2026-11-08')")
    con.commit()
    con.close()
    return path


def test_import_v2_copies_tasks_and_tests(old_db, db):
    assert import_v2(old_db, db, NOW) == (2, 0)
    items = list_tasks(db, TODAY)["items"]
    assert sorted(i["title"] for i in items) == ["Odwracanie", "Podwajanie"]
    task = get_task(db, [i["id"] for i in items if i["title"] == "Odwracanie"][0], TODAY)
    assert task["difficulty"] == "easy" and task["tags"] == [] and task["status"] == "new"
    assert task["interval_days"] == 0 and task["due_date"] == "2026-11-09"
    assert task["starter_code"] == "def odwroc(l):\n    pass\n" and task["hint"] == "Wycinki"
    assert task["tests"] == [{"input": "odwroc([])", "expected": "[]"}, {"input": "odwroc([1,2])", "expected": "[2,1]"}]


def test_import_v2_skips_duplicates(old_db, db):
    import_v2(old_db, db, NOW)
    assert import_v2(old_db, db, NOW) == (0, 2)


def test_import_v2_ignores_reviews(old_db, db):
    import_v2(old_db, db, NOW)
    assert db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0


def test_import_v2_does_not_modify_old_db(old_db, db):
    import_v2(old_db, db, NOW)
    con = sqlite3.connect(old_db)
    assert con.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 1
    con.close()


def test_import_v2_missing_file_exits(tmp_path):
    r = subprocess.run([sys.executable, "scripts/import_v2.py", str(tmp_path / "brak.db"), "--db", str(tmp_path / "n.db")],
                       cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 1 and "Nie znaleziono pliku" in r.stdout + r.stderr


def test_import_v2_cli_reports_counts(old_db, tmp_path):
    r = subprocess.run([sys.executable, "scripts/import_v2.py", old_db, "--db", str(tmp_path / "n.db")],
                       cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0 and "Zaimportowano 2 zadań, pominięto 0" in r.stdout


def test_seed_file_imports(db):
    assert import_seed(os.path.join(ROOT, "seeds", "python_variables.json"), db, NOW) == (10, 0)
    assert list_tags(db) == [{"name": "Zmienne", "count": 10}]
    assert import_seed(os.path.join(ROOT, "seeds", "python_variables.json"), db, NOW) == (0, 10)


def test_seed_defaults(tmp_path, db):
    path = tmp_path / "s.json"
    path.write_text('[{"title": "T", "language": "python", "kind": "function", "description": "d", '
                    '"solution": "s", "tests": [{"input": "f()", "expected": "1"}]}]', encoding="utf-8")
    import_seed(str(path), db, NOW)
    task = get_task(db, list_tasks(db, TODAY)["items"][0]["id"], TODAY)
    assert task["difficulty"] == "easy" and task["tags"] == []


def test_import_seed_skips_invalid(tmp_path, db, capsys):          # Etap 6: import przechodzi tę samą walidację co formularz
    import json
    seed = tmp_path / "seed.json"
    good = {"title": "Dobre", "language": "python", "kind": "function", "description": "d", "solution": "s",
            "tests": [{"input": "f()", "expected": "1"}]}
    bad = {**good, "title": "Bez testów", "tests": []}
    seed.write_text(json.dumps([good, bad]), encoding="utf-8")
    assert import_seed(str(seed), db, NOW) == (1, 1)
    assert [item["title"] for item in list_tasks(db, date(2026, 11, 9))["items"]] == ["Dobre"]
    assert "Pominięto „Bez testów”: tests: Dodaj co najmniej jeden test" in capsys.readouterr().out


def test_import_v2_skips_invalid(old_db, db, capsys):
    con = sqlite3.connect(old_db)
    con.execute("""INSERT INTO tasks VALUES (3, '   ', 'python', 'function', 'Pusty tytuł.', '', '', 's',
                   '2026-11-03T10:00:00', 0, '2026-11-03')""")
    con.execute("INSERT INTO tests VALUES (4, 3, 0, 'f()', '1')")
    con.commit()
    con.close()
    assert import_v2(old_db, db, NOW) == (2, 1)
    assert "Pole nie może być puste" in capsys.readouterr().out
