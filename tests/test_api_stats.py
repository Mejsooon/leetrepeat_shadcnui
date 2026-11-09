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


def test_stats_default_14_days(client):
    daily = client.get("/api/stats").json()["daily"]
    assert len(daily) == 14
    assert daily[-1]["date"] == date.today().isoformat()


def test_stats_custom_range(client):
    daily = client.get("/api/stats?from=2026-11-01&to=2026-11-03").json()["daily"]
    assert [d["date"] for d in daily] == ["2026-11-01", "2026-11-02", "2026-11-03"]


def test_stats_bad_params(client):                     # Review Focus 2
    assert client.get("/api/stats?from=abc").status_code == 422
    reversed_range = client.get("/api/stats?from=2026-11-05&to=2026-11-01")
    assert reversed_range.status_code == 422
    assert "Początek okresu jest po jego końcu" in reversed_range.text
    too_long = client.get("/api/stats?from=2025-01-01&to=2026-11-09")
    assert too_long.status_code == 422
    assert "najwyżej 366 dni" in too_long.text


def test_stats_only_from(client):
    daily = client.get("/api/stats?from=2026-11-01").json()["daily"]
    assert len(daily) == 14 and daily[0]["date"] == "2026-11-01" and daily[-1]["date"] == "2026-11-14"


def test_stats_only_to(client):
    daily = client.get("/api/stats?to=2026-11-14").json()["daily"]
    assert len(daily) == 14 and daily[0]["date"] == "2026-11-01"
