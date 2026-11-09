import subprocess

from backend.api import routes
from backend.services import settings as settings_service
from backend.services.settings import detect_python, get_settings, runner_options, save_settings

VALID = {"python_path": "python3", "dotnet_path": "dotnet", "python_timeout_s": 5, "csharp_timeout_s": 20}
RUN = {"language": "python", "kind": "function", "code": "def f():\n    return 1",
       "tests": [{"input": "f()", "expected": "1"}]}


def test_defaults_when_empty(db):
    assert get_settings(db)["values"] == {"python_path": detect_python(), "dotnet_path": "dotnet",
                                          "python_timeout_s": 5, "csharp_timeout_s": 20}


def test_detect_python_skips_broken(monkeypatch):
    detect_python.cache_clear()
    monkeypatch.setattr(settings_service.shutil, "which", lambda name: None if name == "python3" else f"/x/{name}")
    monkeypatch.setattr(settings_service.subprocess, "run",
                        lambda *a, **k: subprocess.CompletedProcess(a[0], 0, stdout="Python 3.11.2\n", stderr=""))
    assert detect_python() == "/x/py"
    detect_python.cache_clear()


def test_save_and_read(db):
    save_settings(db, {**VALID, "python_timeout_s": 7})
    assert get_settings(db)["values"]["python_timeout_s"] == 7
    assert runner_options(db, "python")["timeout_s"] == 7
    assert runner_options(db, "csharp")["timeout_s"] == 20
    assert runner_options(db, "csharp")["dotnet_path"] == "dotnet"


def test_api_get_put(client):
    response = client.put("/api/settings", json={**VALID, "python_path": " /usr/bin/python3 ", "csharp_timeout_s": 30})
    assert response.status_code == 200
    values = client.get("/api/settings").json()["values"]
    assert values["python_path"] == "/usr/bin/python3"
    assert values["csharp_timeout_s"] == 30


def test_api_validation(client):                     # Review Focus 3
    for bad in (0, -1, 301):
        response = client.put("/api/settings", json={**VALID, "python_timeout_s": bad})
        assert response.status_code == 422
        assert "Limit musi być od 1 do 300 sekund" in response.text
    assert client.put("/api/settings", json={**VALID, "csharp_timeout_s": "abc"}).status_code == 422
    blank = client.put("/api/settings", json={**VALID, "python_path": "  "})
    assert blank.status_code == 422 and "Pole nie może być puste" in blank.text


def test_runtimes_missing_program(client):           # Review Focus 4
    client.put("/api/settings", json={**VALID, "python_path": "/nie/ma/takiego", "dotnet_path": "/bin/false"})
    runtimes = client.get("/api/settings/runtimes").json()
    assert runtimes["python"] == {"found": False, "version": None, "path": "/nie/ma/takiego"}
    assert runtimes["dotnet"]["found"] is False


def test_runtimes_found_python(client):
    python = client.get("/api/settings/runtimes").json()["python"]
    assert python["found"] is True
    assert python["version"].startswith("Python 3")


def test_run_uses_settings(client):                  # Review Focus 4
    client.put("/api/settings", json={**VALID, "python_path": "/nie/ma/takiego"})
    response = client.post("/api/run", json=RUN)
    assert response.status_code == 503
    assert "/nie/ma/takiego" in response.json()["detail"]


def test_run_uses_timeout(client, monkeypatch):
    seen = {}
    monkeypatch.setattr(routes, "run_tests", lambda *a, **k: seen.update(k) or [])
    client.put("/api/settings", json={**VALID, "python_timeout_s": 9})
    client.post("/api/run", json=RUN)
    assert seen["timeout_s"] == 9


def test_cross_site_put_blocked(client):             # Review Focus 2
    before = client.get("/api/settings").json()["values"]["python_path"]
    response = client.put("/api/settings", json={**VALID, "python_path": "/bin/sh"}, headers={"Origin": "http://evil.example"})
    assert response.status_code == 403
    assert client.get("/api/settings").json()["values"]["python_path"] == before
