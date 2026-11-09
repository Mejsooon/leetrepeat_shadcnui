from datetime import date


def test_dashboard_endpoint(client):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    assert set(response.json()) == {
        "due_count", "due_by_language", "new_count", "streak", "longest_streak", "library_count",
        "library_by_language", "queue", "queue_rest", "session_count", "progress_by_language",
        "next_review_date", "completed_today",
    }


def test_dashboard_bad_language(client):
    assert client.get("/api/dashboard?language=java").status_code == 422
