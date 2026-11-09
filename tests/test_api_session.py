from backend.api import routes
from backend.services.runner import RuntimeMissing

TASK = {
    "title": "Suma", "language": "python", "kind": "function", "difficulty": "easy",
    "description": "Dodaj.", "starter_code": "", "hint": "", "solution": "x",
    "tests": [{"input": "add(2, 3)", "expected": "5"}], "tags": [],
}
RUN = {"language": "python", "kind": "function", "code": "def add(a, b):\n    return a + b",
       "tests": [{"input": "add(2, 3)", "expected": "5"}]}
REVIEW = {"rating": "good", "duration_seconds": 30, "tests_passed": 1, "tests_total": 1,
          "hint_used": False, "solution_used": False}


def create(client):
    return client.post("/api/tasks", json=TASK).json()["id"]


def test_session_endpoint(client):
    task_id = create(client)
    assert [item["id"] for item in client.get("/api/session").json()] == [task_id]
    assert client.get("/api/session?language=csharp").json() == []


def test_run_python_function(client):
    response = client.post("/api/run", json=RUN)
    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["status"] == "pass"
    assert isinstance(body["duration_ms"], int)


def test_run_runtime_missing(client, monkeypatch):
    def missing(*args, **kwargs):
        raise RuntimeMissing("Nie znaleziono Pythona: x")
    monkeypatch.setattr(routes, "run_tests", missing)
    response = client.post("/api/run", json=RUN)
    assert response.status_code == 503
    assert response.json()["detail"] == "Nie znaleziono Pythona: x"


def test_run_validation(client):
    assert client.post("/api/run", json={**RUN, "tests": []}).status_code == 422
    assert client.post("/api/run", json={**RUN, "code": "x" * 100_001}).status_code == 422


def test_review_preview_and_review(client):
    task_id = create(client)
    preview = client.get(f"/api/tasks/{task_id}/review-preview").json()
    assert len(preview) == 4 and preview[2]["rating"] == "good"
    response = client.post(f"/api/tasks/{task_id}/review", json=REVIEW)
    assert response.status_code == 200
    assert response.json()["interval_days"] == 3
    assert client.get(f"/api/tasks/{task_id}").json()["status"] == "learning"


def test_review_404(client):
    assert client.get("/api/tasks/999/review-preview").status_code == 404
    assert client.post("/api/tasks/999/review", json=REVIEW).status_code == 404


def test_review_validation(client):
    task_id = create(client)
    url = f"/api/tasks/{task_id}/review"
    assert client.post(url, json={**REVIEW, "rating": "meh"}).status_code == 422
    bad = client.post(url, json={**REVIEW, "tests_passed": 3, "tests_total": 2})
    assert bad.status_code == 422 and "Nieprawidłowa liczba testów" in bad.text
    assert client.post(url, json={**REVIEW, "tests_total": None}).status_code == 422
    assert client.post(url, json={**REVIEW, "tests_passed": None, "tests_total": None}).status_code == 200
