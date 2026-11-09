VALID = {"python_path": "python3", "dotnet_path": "dotnet", "python_timeout_s": 5, "csharp_timeout_s": 20}
TASK = {
    "title": "Two Sum", "language": "python", "kind": "function", "difficulty": "easy",
    "description": "Treść.", "starter_code": "", "hint": "", "solution": "x",
    "tests": [{"input": "f()", "expected": "1"}], "tags": [],
}
REVIEW = {"rating": "good", "duration_seconds": 5, "tests_passed": None, "tests_total": None,
          "hint_used": False, "solution_used": False}


def detail(response):
    assert response.status_code == 422, response.text
    return response.json()["detail"]


def test_validation_message_without_prefix(client):
    assert detail(client.put("/api/settings", json={**VALID, "python_timeout_s": 0})) == "Limit musi być od 1 do 300 sekund"


def test_int_parsing(client):
    assert detail(client.put("/api/settings", json={**VALID, "python_timeout_s": "abc"})) == "Wpisz liczbę całkowitą"


def test_bad_dates(client):
    for query in ("from=abc", "from=2026-02-30"):
        assert detail(client.get(f"/api/stats?{query}")) == "Nieprawidłowa data — użyj formatu RRRR-MM-DD"


def test_literal(client):
    task_id = client.post("/api/tasks", json=TASK).json()["id"]
    assert detail(client.post(f"/api/tasks/{task_id}/review", json={**REVIEW, "rating": "meh"})) == "Niedozwolona wartość"


def test_blank_title(client):
    assert detail(client.post("/api/tasks", json={**TASK, "title": "  "})) == "Pole nie może być puste"


def test_other_errors_unchanged(client):                 # Review Focus 2
    assert client.get("/api/tasks/999").json()["detail"] == "Nie znaleziono zadania"
    bad = client.post("/api/backup/restore", content=b"", headers={"Content-Type": "application/octet-stream"})
    assert bad.status_code == 409 and bad.json()["detail"] == "To nie jest plik bazy danych"
    foreign = client.put("/api/settings", json=VALID, headers={"Origin": "http://evil.example"})
    assert foreign.status_code == 403 and foreign.json()["detail"] == "Żądanie z innej strony zostało zablokowane"
