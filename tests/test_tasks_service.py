from datetime import date, datetime

from backend.services.tasks import (
    create_task, delete_task, get_task, list_tags, list_tasks, task_status, update_notes, update_task,
)

TODAY = date(2026, 11, 9)
NOW = datetime(2026, 11, 9, 10, 0)


def make(**changes):
    task = {
        "title": "Two Sum", "language": "python", "kind": "function", "difficulty": "easy",
        "description": "Zwróć indeksy dwóch liczb.", "starter_code": "", "hint": "", "solution": "def two_sum(n, t): ...",
        "tests": [{"input": "two_sum([2,7], 9)", "expected": "[0,1]"}, {"input": "two_sum([3,3], 6)", "expected": "[0,1]"}],
        "tags": [],
    }
    task.update(changes)
    return task


def add_review(db, task_id, when="2026-11-08T10:00:00"):
    db.execute("""INSERT INTO reviews(task_id, rating, reviewed_at, duration_seconds, hint_used, solution_used)
                  VALUES (?, 'good', ?, 60, 0, 0)""", (task_id, when))


def test_create_and_get_task(db):
    task_id = create_task(db, make(tags=["Tablice"]), NOW)
    task = get_task(db, task_id, TODAY)
    assert task["title"] == "Two Sum"
    assert task["due_date"] == "2026-11-09"
    assert task["interval_days"] == 0
    assert task["status"] == "new"
    assert task["last_reviewed_at"] is None
    assert task["tags"] == ["Tablice"]
    assert [t["input"] for t in task["tests"]] == ["two_sum([2,7], 9)", "two_sum([3,3], 6)"]
    assert task["created_at"] == task["updated_at"] == "2026-11-09T10:00:00"


def test_update_keeps_schedule(db):
    task_id = create_task(db, make(), NOW)
    db.execute("UPDATE tasks SET interval_days = 5, due_date = '2026-11-12' WHERE id = ?", (task_id,))
    assert update_task(db, task_id, make(title="Two Sum v2", tests=[{"input": "f()", "expected": "1"}]),
                       datetime(2026, 11, 9, 12, 0)) is True
    task = get_task(db, task_id, TODAY)
    assert task["title"] == "Two Sum v2"
    assert task["interval_days"] == 5 and task["due_date"] == "2026-11-12"
    assert task["updated_at"] == "2026-11-09T12:00:00" and task["created_at"] == "2026-11-09T10:00:00"
    assert [t["input"] for t in task["tests"]] == ["f()"]


def test_update_missing_returns_false(db):
    assert update_task(db, 999, make(), NOW) is False


def test_delete_cascades_and_drops_orphan_tags(db):
    task_id = create_task(db, make(tags=["Tablice"]), NOW)
    assert delete_task(db, task_id) is True
    assert get_task(db, task_id, TODAY) is None
    assert list_tags(db) == []
    assert delete_task(db, task_id) is False


def test_tags_normalized(db):
    task_id = create_task(db, make(tags=[" Tablice ", "tablice", "", "Stos"]), NOW)
    assert get_task(db, task_id, TODAY)["tags"] == ["Stos", "Tablice"]


def test_polish_tag_case_insensitive(db):                          # Review Focus 1
    create_task(db, make(title="A", tags=["Łańcuchy"]), NOW)
    create_task(db, make(title="B", tags=["łańcuchy"]), NOW)
    assert list_tags(db) == [{"name": "Łańcuchy", "count": 2}]


def test_search_polish_case_insensitive(db):                       # Review Focus 1
    create_task(db, make(title="Łańcuch znaków"), NOW)
    create_task(db, make(title="Inne", description="Odwróć ŻÓŁWIA"), NOW)
    assert [i["title"] for i in list_tasks(db, TODAY, q="ŁAŃCUCH")["items"]] == ["Łańcuch znaków"]
    assert [i["title"] for i in list_tasks(db, TODAY, q="łańcuch")["items"]] == ["Łańcuch znaków"]
    assert [i["title"] for i in list_tasks(db, TODAY, q="żółwia")["items"]] == ["Inne"]


def test_task_status_rules():
    assert task_status(0, "2026-11-01", 0, TODAY) == "new"
    assert task_status(2, "2026-11-09", 3, TODAY) == "due"
    assert task_status(2, "2026-11-12", 20.9, TODAY) == "learning"
    assert task_status(2, "2026-12-20", 21, TODAY) == "consolidated"


def test_list_filters_and_sorting(db):
    a = create_task(db, make(title="A", language="python", difficulty="easy", tags=["Stos"]), NOW)
    b = create_task(db, make(title="B", language="csharp", difficulty="medium"), NOW)
    c = create_task(db, make(title="C", language="python", difficulty="hard"), NOW)
    db.execute("UPDATE tasks SET due_date = '2026-11-20' WHERE id = ?", (a,))
    db.execute("UPDATE tasks SET due_date = '2026-11-01' WHERE id = ?", (c,))
    ids = lambda **f: [i["id"] for i in list_tasks(db, TODAY, **f)["items"]]
    assert ids() == [c, b, a]
    assert ids(language="csharp") == [b]
    assert ids(difficulty="hard") == [c]
    assert ids(tag="stos") == [a]
    item = list_tasks(db, TODAY, tag="Stos")["items"][0]
    assert set(item) == {"id", "title", "tags", "language", "difficulty", "due_date", "status"}


def test_list_status_filter(db):
    reviewed = create_task(db, make(title="Oceniane"), NOW)
    fresh = create_task(db, make(title="Nowe"), NOW)
    add_review(db, reviewed)
    assert [i["id"] for i in list_tasks(db, TODAY, status="due")["items"]] == [reviewed]
    assert [i["id"] for i in list_tasks(db, TODAY, status="new")["items"]] == [fresh]
    db.execute("UPDATE tasks SET due_date = '2026-12-31', interval_days = 30 WHERE id = ?", (reviewed,))
    assert [i["id"] for i in list_tasks(db, TODAY, status="consolidated")["items"]] == [reviewed]
    assert list_tasks(db, TODAY, status="learning")["items"] == []


def test_pagination_and_counts(db):
    for n in range(23):
        create_task(db, make(title=f"Z{n:02}"), NOW)
    first = create_task(db, make(title="Oceniane"), NOW)
    add_review(db, first)
    result = list_tasks(db, TODAY, page=3, language="python")
    assert len(result["items"]) == 4 and result["pages"] == 3 and result["total"] == 24
    assert list_tasks(db, TODAY, language="csharp")["counts"] == {"library": 24, "due": 1, "new": 23}


def test_page_out_of_range(db):                                     # Review Focus 2
    for n in range(12):
        create_task(db, make(title=f"Z{n}"), NOW)
    result = list_tasks(db, TODAY, page=5)
    assert result["items"] == [] and result["pages"] == 2 and result["total"] == 12


def test_empty_library_has_one_page(db):
    assert list_tasks(db, TODAY)["pages"] == 1


def test_update_notes(db):
    task_id = create_task(db, make(), NOW)
    assert update_notes(db, task_id, "Mapa: liczba → indeks") is True
    assert get_task(db, task_id, TODAY)["notes"] == "Mapa: liczba → indeks"
    assert update_notes(db, 999, "x") is False


def test_last_reviewed_at(db):
    task_id = create_task(db, make(), NOW)
    add_review(db, task_id, "2026-11-05T09:00:00")
    add_review(db, task_id, "2026-11-08T09:00:00")
    assert get_task(db, task_id, TODAY)["last_reviewed_at"] == "2026-11-08T09:00:00"


def test_search_percent_and_underscore_literal(db):                  # Etap 6: % i _ nie są wieloznacznikami
    for title in ("100% pewne", "1000 zadań", "a_b", "axb"):
        create_task(db, make(title=title), NOW)
    titles = lambda q: sorted(item["title"] for item in list_tasks(db, TODAY, q=q)["items"])  # noqa: E731
    assert titles("%") == ["100% pewne"]
    assert titles("a_b") == ["a_b"]
