from datetime import date, datetime

import pytest

from backend.services.scheduler import next_schedule, review_preview, session_queue, submit_review
from backend.services.tasks import create_task, get_task

TODAY = date(2026, 11, 9)
NOW = datetime(2026, 11, 9, 10, 0)

TASK = {
    "title": "Two Sum", "language": "python", "kind": "function", "difficulty": "easy",
    "description": "Zwróć indeksy.", "starter_code": "", "hint": "", "solution": "x",
    "tests": [{"input": "f()", "expected": "1"}], "tags": [],
}
REVIEW = {"rating": "good", "duration_seconds": 60, "tests_passed": 2, "tests_total": 3,
          "hint_used": True, "solution_used": False}


def add(db, title, language="python", reviewed=False, due="2026-11-09", created="2026-11-01T10:00:00"):
    task_id = create_task(db, {**TASK, "title": title, "language": language}, NOW)
    db.execute("UPDATE tasks SET due_date = ?, created_at = ? WHERE id = ?", (due, created, task_id))
    if reviewed:
        db.execute("""INSERT INTO reviews(task_id, rating, reviewed_at, duration_seconds, hint_used, solution_used)
                      VALUES (?, 'good', '2026-11-01T10:00:00', 60, 0, 0)""", (task_id,))
        db.execute("UPDATE tasks SET interval_days = 3 WHERE id = ?", (task_id,))
    return task_id


@pytest.mark.parametrize("rating,interval,due", [
    ("again", 0, "2026-11-09"), ("hard", 1, "2026-11-10"), ("good", 3, "2026-11-12"), ("easy", 7, "2026-11-16")])
def test_new_task(rating, interval, due):
    assert next_schedule(rating, 0, TODAY) == (interval, due)


@pytest.mark.parametrize("rating,interval,due", [
    ("again", 0, "2026-11-09"), ("hard", 12.0, "2026-11-21"), ("good", 25.0, "2026-12-04"), ("easy", 35.0, "2026-12-14")])
def test_learning_task(rating, interval, due):
    new_interval, new_due = next_schedule(rating, 10, TODAY)
    assert new_interval == pytest.approx(interval) and new_due == due


def test_hard_minimum_one_day():
    assert next_schedule("hard", 1, TODAY) == (2, "2026-11-11")


def test_rounding_half_up():
    assert next_schedule("good", 1.0, TODAY) == (2.5, "2026-11-12")


def test_submit_review_saves_row_and_schedule(db):
    task_id = create_task(db, TASK, NOW)
    assert submit_review(db, task_id, REVIEW, NOW) == {"interval_days": 3, "due_date": "2026-11-12"}
    rows = db.execute("SELECT * FROM reviews").fetchall()
    assert len(rows) == 1
    assert (rows[0]["rating"], rows[0]["hint_used"], rows[0]["solution_used"]) == ("good", 1, 0)
    assert (rows[0]["tests_passed"], rows[0]["tests_total"], rows[0]["duration_seconds"]) == (2, 3, 60)
    task = get_task(db, task_id, TODAY)
    assert (task["interval_days"], task["due_date"], task["status"]) == (3, "2026-11-12", "learning")
    assert task["last_reviewed_at"] == "2026-11-09T10:00:00"


def test_submit_review_missing_task(db):
    assert submit_review(db, 999, REVIEW, NOW) is None
    assert db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0


def test_review_preview(db):
    task_id = create_task(db, TASK, NOW)
    assert review_preview(db, task_id, TODAY) == [
        {"rating": "again", "interval_days": 0, "due_date": "2026-11-09"},
        {"rating": "hard", "interval_days": 1, "due_date": "2026-11-10"},
        {"rating": "good", "interval_days": 3, "due_date": "2026-11-12"},
        {"rating": "easy", "interval_days": 7, "due_date": "2026-11-16"},
    ]
    assert review_preview(db, 999, TODAY) is None


def test_session_order(db):
    a = add(db, "A", reviewed=True, due="2026-11-05")
    b = add(db, "B", reviewed=True, due="2026-11-01")
    c = add(db, "C", created="2026-11-02T10:00:00")
    d = add(db, "D", created="2026-11-01T10:00:00")
    add(db, "E", reviewed=True, due="2026-11-20")
    queue = session_queue(db, TODAY)
    assert [item["id"] for item in queue] == [b, a, d, c]
    assert queue[0] == {"id": b, "title": "B", "language": "python", "difficulty": "easy", "tags": [], "status": "due"}
    assert queue[2]["status"] == "new"


def test_session_language_filter(db):
    add(db, "Py")
    cs = add(db, "Cs", language="csharp")
    assert [item["id"] for item in session_queue(db, TODAY, "csharp")] == [cs]


def test_again_keeps_task_due_today(db):
    task_id = create_task(db, TASK, NOW)
    submit_review(db, task_id, {**REVIEW, "rating": "again"}, NOW)
    assert get_task(db, task_id, TODAY)["status"] == "due"
    assert [item["id"] for item in session_queue(db, TODAY)] == [task_id]
