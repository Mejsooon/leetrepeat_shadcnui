import pytest
from fastapi.testclient import TestClient

from main import create_app


@pytest.fixture
def app(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    return create_app(str(tmp_path / "test.db"), str(dist))


@pytest.fixture
def client(app):
    return TestClient(app, base_url="http://127.0.0.1")


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
