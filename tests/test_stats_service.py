from datetime import date, datetime

import pytest

from backend.services.stats import dashboard, streaks
from backend.services.tasks import create_task

TODAY = date(2026, 11, 9)
NOW = datetime(2026, 11, 9, 10, 0)

TASK = {
    "title": "Two Sum", "language": "python", "kind": "function", "difficulty": "easy",
    "description": "Treść.", "starter_code": "", "hint": "", "solution": "x",
    "tests": [{"input": "f()", "expected": "1"}], "tags": [],
}


def add(db, title, language="python", interval=0, due="2026-11-09"):
    """Zadanie z ustawionym odstępem i terminem (oceny dokłada review())."""
    task_id = create_task(db, {**TASK, "title": title, "language": language}, NOW)
    db.execute("UPDATE tasks SET interval_days = ?, due_date = ? WHERE id = ?", (interval, due, task_id))
    return task_id


def review(db, task_id, day="2026-11-01", rating="good", duration=60):
    db.execute("""INSERT INTO reviews(task_id, rating, reviewed_at, duration_seconds, hint_used, solution_used)
                  VALUES (?, ?, ?, ?, 0, 0)""", (task_id, rating, f"{day}T10:00:00", duration))


# --- Seria dni ---

@pytest.mark.parametrize("days,expected", [
    ([], (0, 0)),
    (["2026-11-07", "2026-11-08", "2026-11-09"], (3, 3)),
    (["2026-11-07", "2026-11-08"], (2, 2)),
    (["2026-11-06", "2026-11-07"], (0, 2)),
    (["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-11-09"], (1, 4)),
])
def test_streaks(days, expected):
    assert streaks(days, TODAY) == expected


# --- Pulpit ---

def test_dashboard_empty(db):
    d = dashboard(db, TODAY)
    assert (d["due_count"], d["new_count"], d["library_count"], d["streak"], d["longest_streak"]) == (0, 0, 0, 0, 0)
    assert (d["completed_today"], d["session_count"], d["queue"], d["queue_rest"]) == (0, 0, [], [])
    assert d["next_review_date"] is None
    assert d["progress_by_language"] == [
        {"language": "python", "consolidated": 0, "learning": 0, "new": 0},
        {"language": "csharp", "consolidated": 0, "learning": 0, "new": 0},
    ]


def test_dashboard_counts(db):
    add(db, "Nowe 1")
    add(db, "Nowe 2")
    due_cs = add(db, "Do powtórki C#", language="csharp", interval=3, due="2026-11-08")
    learning = add(db, "W nauce", interval=3, due="2026-11-12")
    consolidated = add(db, "Utrwalone", interval=30, due="2026-12-20")
    for task_id in (due_cs, learning, consolidated):
        review(db, task_id)
    d = dashboard(db, TODAY)
    assert d["due_count"] == 1
    assert d["due_by_language"] == {"python": 0, "csharp": 1}
    assert d["new_count"] == 2
    assert d["library_count"] == 5
    assert d["library_by_language"] == {"python": 4, "csharp": 1}
    assert d["session_count"] == 3
    assert len(d["queue"]) == 3 and d["queue_rest"] == []
    assert d["queue"][0] == {"id": due_cs, "title": "Do powtórki C#", "language": "csharp", "difficulty": "easy",
                             "due_date": "2026-11-08"}
    assert d["progress_by_language"] == [
        {"language": "python", "consolidated": 1, "learning": 1, "new": 2},
        {"language": "csharp", "consolidated": 0, "learning": 1, "new": 0},
    ]
    assert d["next_review_date"] == "2026-11-12"


def test_dashboard_queue_rest(db):
    for i in range(5):
        add(db, f"Zadanie {i + 1}")
    d = dashboard(db, TODAY)
    assert len(d["queue"]) == 3
    assert d["queue_rest"] == ["Zadanie 4", "Zadanie 5"]
    assert d["session_count"] == 5


def test_dashboard_done(db):
    task_id = add(db, "Dziś zrobione", interval=3, due="2026-11-12")
    review(db, task_id, day="2026-11-09")
    d = dashboard(db, TODAY)
    assert (d["completed_today"], d["due_count"], d["session_count"]) == (1, 0, 0)
    assert d["queue"] == [{"id": task_id, "title": "Dziś zrobione", "language": "python", "difficulty": "easy",
                           "due_date": "2026-11-12"}]
    assert d["queue_rest"] == []
    assert (d["streak"], d["longest_streak"]) == (1, 1)


def test_dashboard_language(db):
    add(db, "Py")
    add(db, "Cs", language="csharp")
    d = dashboard(db, TODAY, "csharp")
    assert d["library_count"] == 1
    assert [item["title"] for item in d["queue"]] == ["Cs"]
