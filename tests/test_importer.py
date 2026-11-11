import json
import os
from datetime import date, datetime

import pytest

from backend.services.importer import ImportFormatError, preview_import
from backend.services.tasks import create_task

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = datetime(2026, 11, 10, 10, 0)
TODAY = date(2026, 11, 10)

# Poprawne zadanie bez difficulty, tags, starter_code i hint (pola opcjonalne)
TASK = {
    "title": "Suma liczb parzystych", "language": "python", "kind": "function",
    "description": "Zwróć sumę liczb parzystych.",
    "solution": "def suma_parzystych(lista):\n    return sum(x for x in lista if x % 2 == 0)\n",
    "tests": [{"input": "suma_parzystych([1, 2, 3, 4])", "expected": "6"}],
}


def full(task):
    # Zadanie w kształcie TaskIn (do create_task w przygotowaniu bazy)
    return {"difficulty": "easy", "starter_code": "", "hint": "", "tags": [], **task}


def test_preview_new_task(db):
    items = preview_import(db, json.dumps([TASK]))
    assert len(items) == 1
    assert items[0]["status"] == "new"
    assert items[0]["message"] == ""
    assert items[0]["index"] == 0
    assert items[0]["title"] == TASK["title"] and items[0]["language"] == "python"
    assert items[0]["task"]["difficulty"] == "easy"
    assert items[0]["task"]["tags"] == []


def test_preview_strips_code_fence(db):
    assert preview_import(db, "```json\n" + json.dumps([TASK]) + "\n```")[0]["status"] == "new"
    assert preview_import(db, "```\n" + json.dumps([TASK]) + "\n```")[0]["status"] == "new"


def test_preview_strips_code_fence_crlf(db):              # Review Focus 1
    text = "```json\r\n" + json.dumps([TASK], indent=2).replace("\n", "\r\n") + "\r\n```\r\n"
    assert preview_import(db, text)[0]["status"] == "new"


def test_preview_single_object(db):
    items = preview_import(db, json.dumps(TASK))
    assert len(items) == 1 and items[0]["status"] == "new"


def test_preview_invalid_json(db):
    with pytest.raises(ImportFormatError) as error:
        preview_import(db, '[{"title": }')
    assert str(error.value) == "Nieprawidłowy JSON w linii 1, kolumnie 12"


def test_preview_prose_around_block(db):                  # Review Focus 2
    with pytest.raises(ImportFormatError) as error:
        preview_import(db, "Oto zadania:\n```json\n[]\n```")
    assert str(error.value).startswith("Nieprawidłowy JSON w linii 1")


def test_preview_not_a_list(db):
    with pytest.raises(ImportFormatError) as error:
        preview_import(db, "42")
    assert str(error.value) == "Oczekiwano listy zadań"


def test_preview_empty_list(db):
    with pytest.raises(ImportFormatError) as error:
        preview_import(db, "[]")
    assert str(error.value) == "Brak zadań do importu"


def test_preview_too_many(db):
    many = [{**TASK, "title": f"Zadanie {i}"} for i in range(101)]
    with pytest.raises(ImportFormatError) as error:
        preview_import(db, json.dumps(many))
    assert str(error.value) == "Najwyżej 100 zadań naraz — podziel plik"
    assert len(preview_import(db, json.dumps(many[:100]))) == 100


def test_preview_element_not_object(db):
    item = preview_import(db, "[1]")[0]
    assert item["status"] == "invalid"
    assert item["message"] == "To nie jest zadanie"
    assert item["title"] is None and item["language"] is None and item["task"] is None


def test_preview_invalid_field(db):
    no_tests = preview_import(db, json.dumps([{**TASK, "tests": []}]))[0]
    assert no_tests["status"] == "invalid"
    assert no_tests["message"] == "tests: Dodaj co najmniej jeden test"
    assert no_tests["title"] == TASK["title"] and no_tests["task"] is None
    java = preview_import(db, json.dumps([{**TASK, "language": "java"}]))[0]
    assert java["message"] == "language: Niedozwolona wartość"
    assert java["language"] == "java"
    no_expected = preview_import(db, json.dumps([{**TASK, "tests": [{"input": "f()"}]}]))[0]
    assert no_expected["message"] == "tests.0.expected: Brak wymaganego pola"


def test_preview_ignores_unknown_fields(db):
    assert preview_import(db, json.dumps([{**TASK, "hints": "x"}]))[0]["status"] == "new"


def test_preview_duplicate_in_db(db):
    create_task(db, full(TASK), NOW)
    item = preview_import(db, json.dumps([TASK]))[0]
    assert item["status"] == "duplicate"
    assert item["message"] == "Już jest w bibliotece"
    assert item["task"] is None


def test_preview_duplicate_in_file(db):
    second = {**TASK, "title": "  " + TASK["title"] + " "}
    items = preview_import(db, json.dumps([TASK, second]))
    assert [i["status"] for i in items] == ["new", "duplicate"]
    assert items[1]["message"] == "Powtórzone w pliku"


def test_preview_seed_file(db):
    with open(os.path.join(ROOT, "seeds", "python_variables.json"), encoding="utf-8") as f:
        items = preview_import(db, f.read())
    assert len(items) == 10
    assert all(i["status"] == "new" for i in items)
