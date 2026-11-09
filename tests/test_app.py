from fastapi.testclient import TestClient

from main import create_app


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "version": "3.0.0"}


def test_root_serves_index(client):
    assert 'id="root"' in client.get("/").text


def test_deep_link_serves_index(client):                       # Review Focus 1
    r = client.get("/statystyki")
    assert r.status_code == 200 and 'id="root"' in r.text


def test_asset_served(client):
    assert client.get("/assets/app.js").status_code == 200


def test_unknown_api_is_json_404(client):                      # Review Focus 2
    r = client.get("/api/zadanka")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")


def test_foreign_host_rejected(app):                           # Review Focus 3
    r = TestClient(app, base_url="http://evil.example").get("/api/health")
    assert r.status_code == 400


def test_missing_dist_explains(tmp_path):                      # Review Focus 5
    app = create_app(str(tmp_path / "x.db"), str(tmp_path / "brak"))
    r = TestClient(app, base_url="http://127.0.0.1").get("/")
    assert r.status_code == 503 and "npm run build" in r.text


def test_path_traversal_not_served(client, tmp_path):
    (tmp_path / "sekret.txt").write_text("tajne", encoding="utf-8")
    r = client.get("/..%2Fsekret.txt")
    assert "tajne" not in r.text


# --- Review Focus 1 (Etap 3): obca strona nie może uruchomić kodu ani zmienić danych ---
BLOCKED = "Żądanie z innej strony zostało zablokowane"
RUN = {"language": "python", "kind": "function", "code": "def f():\n    return 1",
       "tests": [{"input": "f()", "expected": "1"}]}


def counting_runner(monkeypatch):
    from backend.api import routes
    calls = []
    monkeypatch.setattr(routes, "run_tests", lambda *a, **k: calls.append(1) or [])
    return calls


def test_cross_site_post_blocked(client, monkeypatch):
    calls = counting_runner(monkeypatch)
    response = client.post("/api/run", json=RUN, headers={"Origin": "http://evil.example"})
    assert response.status_code == 403
    assert response.json()["detail"] == BLOCKED
    assert calls == []


def test_null_origin_blocked(client, monkeypatch):
    calls = counting_runner(monkeypatch)
    assert client.post("/api/run", json=RUN, headers={"Origin": "null"}).status_code == 403
    assert calls == []


def test_sec_fetch_site_cross_site_blocked(client):
    assert client.delete("/api/tasks/1", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


def test_own_port_allowed(client, monkeypatch):                    # Etap 6, Review Focus 1
    # Klient testowy wysyła Host "127.0.0.1" (port 80) — własny port to 80
    counting_runner(monkeypatch)
    for origin in ("http://127.0.0.1", "http://localhost"):
        assert client.post("/api/run", json=RUN, headers={"Origin": origin}).status_code == 200


def test_vite_dev_server_allowed_via_host(client, monkeypatch):
    # Proxy Vite przekazuje Host "localhost:5173" — ten sam port co Origin, więc przechodzi
    counting_runner(monkeypatch)
    response = client.post("/api/run", json=RUN, headers={"Host": "localhost:5173", "Origin": "http://localhost:5173"})
    assert response.status_code == 200


def test_other_app_on_5173_blocked(client):                        # przegląd końcowy: inny projekt Vite na 5173
    response = client.post("/api/run", json=RUN, headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 403


def test_other_local_port_blocked(client):
    for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        response = client.put("/api/settings", json={"python_path": "/bin/sh", "dotnet_path": "dotnet",
                                                     "python_timeout_s": 5, "csharp_timeout_s": 20},
                              headers={"Origin": origin})
        assert response.status_code == 403


def test_localhost_vs_ip_same_port(client, monkeypatch):           # Review Focus 1
    counting_runner(monkeypatch)
    response = client.post("/api/run", json=RUN, headers={"Host": "127.0.0.1:8000", "Origin": "http://localhost:8000"})
    assert response.status_code == 200


def test_head_request(client):
    assert client.head("/").status_code == 200


def test_missing_static_file_404(client):                          # Review Focus 3
    assert client.get("/favicon.ico").status_code == 404
    for path in ("/zadania/5/edycja", "/statystyki?dni=30"):
        response = client.get(path)
        assert response.status_code == 200 and 'id="root"' in response.text
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/index.html").status_code == 200


def test_get_with_foreign_origin_allowed(client):
    assert client.get("/api/health", headers={"Origin": "http://evil.example"}).status_code == 200
