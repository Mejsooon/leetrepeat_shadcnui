import sqlite3
from datetime import date, datetime

import pytest

from backend.api import routes
from backend.services import backup as backup_service

TASK = {
    "title": "Two Sum", "language": "python", "kind": "function", "difficulty": "easy",
    "description": "Treść.", "starter_code": "", "hint": "", "solution": "x",
    "tests": [{"input": "f()", "expected": "1"}], "tags": [],
}


def db_dir(tmp_path):
    return tmp_path          # conftest: baza testowa to tmp_path / "test.db"


def download(client) -> bytes:
    response = client.get("/api/backup")
    assert response.status_code == 200
    return response.content


def restore(client, data: bytes, **headers):
    return client.post("/api/backup/restore", content=data,
                       headers={"Content-Type": "application/octet-stream", **headers})


def task_count(client) -> int:
    return client.get("/api/tasks").json()["total"]


def sqlite_bytes(tmp_path, name: str, sql: str) -> bytes:
    path = tmp_path / name
    con = sqlite3.connect(path)
    con.executescript(sql)
    con.close()
    return path.read_bytes()


def backups_beside(tmp_path):
    return sorted(p.name for p in tmp_path.iterdir() if "przed-przywroceniem" in p.name)


def test_download_backup(client, tmp_path):
    client.post("/api/tasks", json=TASK)
    response = client.get("/api/backup")
    assert response.status_code == 200
    assert response.content.startswith(b"SQLite format 3\x00")
    assert f"leetrepeat-{date.today().isoformat()}.db" in response.headers["content-disposition"]
    copy = tmp_path / "pobrana.db"
    copy.write_bytes(response.content)
    con = sqlite3.connect(copy)
    assert con.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 1
    con.close()
    assert client.get("/api/settings").json()["database"]["last_backup_at"] is not None


def test_restore_roundtrip(client, tmp_path):
    client.post("/api/tasks", json=TASK)
    data = download(client)
    client.post("/api/tasks", json={**TASK, "title": "Drugie"})
    assert task_count(client) == 2
    response = restore(client, data)
    assert response.status_code == 200
    body = response.json()
    assert body["tasks"] == 1
    assert task_count(client) == 1
    con = sqlite3.connect(body["backup_path"])
    assert con.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 2     # poprzednia baza zachowana obok
    con.close()


def bad_files(tmp_path):
    return [
        (b"", "To nie jest plik bazy danych"),
        (b"\x89PNG\r\n\x1a\n" + b"0" * 100, "To nie jest plik bazy danych"),
        (sqlite_bytes(tmp_path, "obca.db", "CREATE TABLE foo (x INTEGER);"), "brak tabeli tasks"),
    ]


@pytest.mark.parametrize("index", [0, 1, 2])
def test_restore_rejects_bad_file(client, tmp_path, index):          # Review Focus 1
    client.post("/api/tasks", json=TASK)
    data, message = bad_files(tmp_path)[index]
    response = restore(client, data)
    assert response.status_code == 409
    assert message in response.json()["detail"]
    assert task_count(client) == 1
    assert backups_beside(tmp_path) == []


def test_restore_rejects_truncated(client, tmp_path):                 # Review Focus 1
    for i in range(30):
        client.post("/api/tasks", json={**TASK, "title": f"Zadanie {i}", "description": "x" * 2000})
    data = download(client)
    response = restore(client, data[: len(data) // 2])
    assert response.status_code == 409
    assert "uszkodzony" in response.json()["detail"]
    assert task_count(client) == 30
    assert backups_beside(tmp_path) == []


def test_restore_missing_column(client, tmp_path):
    from backend.core.database import SCHEMA
    schema_without_notes = SCHEMA.replace("notes", "notatki_inne")
    data = sqlite_bytes(tmp_path, "bez-notes.db", schema_without_notes)
    response = restore(client, data)
    assert response.status_code == 409
    assert "brak kolumny tasks.notes" in response.json()["detail"]


def test_two_restores_two_backups(client, tmp_path, monkeypatch):     # Review Focus 5
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 11, 9, 12, 0, 0)
    monkeypatch.setattr(routes, "datetime", FixedDatetime)
    data = download(client)
    first = restore(client, data).json()["backup_path"]
    second = restore(client, data).json()["backup_path"]
    assert first != second
    assert len(backups_beside(tmp_path)) == 2


def test_restore_cross_site_blocked(client, tmp_path):               # Review Focus 2
    client.post("/api/tasks", json=TASK)
    data = download(client)
    client.post("/api/tasks", json={**TASK, "title": "Drugie"})
    assert restore(client, data, Origin="http://evil.example").status_code == 403
    assert task_count(client) == 2


def test_restore_too_large(client, monkeypatch):
    monkeypatch.setattr(backup_service, "MAX_RESTORE_BYTES", 10)
    response = restore(client, b"x" * 11)
    assert response.status_code == 413
    assert response.json()["detail"] == "Plik jest za duży"


def test_settings_database_info(client):
    client.post("/api/tasks", json=TASK)
    database = client.get("/api/settings").json()["database"]
    assert database["task_count"] == 1
    assert database["path"].endswith("test.db")
    assert database["last_backup_at"] is None


@pytest.mark.parametrize("folder", ["C#projekty", "a%20b", "pyt?anie"])
def test_restore_in_folder_with_special_chars(tmp_path, folder):   # przegląd końcowy: ścieżka czytana jako URI
    from fastapi.testclient import TestClient
    from main import create_app
    db_dir = tmp_path / folder
    db_dir.mkdir()
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    special = TestClient(create_app(str(db_dir / "leetrepeat.db"), str(dist)), base_url="http://127.0.0.1")
    special.post("/api/tasks", json=TASK)
    data = download(special)
    response = restore(special, data)
    assert response.status_code == 200, response.text
    assert response.json()["tasks"] == 1
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted([folder, "dist"])   # nic nie powstało poza folderem bazy


def test_backup_download_cross_site(client):                       # Etap 6
    assert client.get("/api/backup", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get("/api/settings").json()["database"]["last_backup_at"] is None


def test_backup_temp_removed_on_error(app, tmp_path, monkeypatch):
    import tempfile as tempfile_module
    from fastapi.testclient import TestClient
    temp_dir = tmp_path / "tmp"
    temp_dir.mkdir()
    real_mkstemp = tempfile_module.mkstemp
    monkeypatch.setattr(routes.tempfile, "mkstemp", lambda **kw: real_mkstemp(dir=temp_dir, **{k: v for k, v in kw.items() if k != "dir"}))

    def broken(*args):
        raise OSError("dysk pełny")
    monkeypatch.setattr(backup_service, "export_copy", broken)
    client = TestClient(app, base_url="http://127.0.0.1", raise_server_exceptions=False)
    assert client.get("/api/backup").status_code == 500
    assert list(temp_dir.iterdir()) == []


def test_restore_wal_file_switches_to_delete(client, tmp_path):      # Etap 6, Review Focus 5
    from backend.core.database import SCHEMA
    wal_path = tmp_path / "wal-kopia.db"
    con = sqlite3.connect(wal_path)
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    con.execute("""INSERT INTO tasks (title, language, kind, difficulty, description, starter_code, hint, solution,
                   notes, created_at, updated_at, interval_days, due_date)
                   VALUES ('Z kopii', 'python', 'function', 'easy', 'd', '', '', 's', '', '2026-11-01T10:00:00',
                           '2026-11-01T10:00:00', 0, '2026-11-01')""")
    con.commit()
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.close()
    response = restore(client, wal_path.read_bytes())
    assert response.status_code == 200, response.text
    live = sqlite3.connect(tmp_path / "test.db")
    assert live.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
    live.close()
    assert client.post("/api/tasks", json=TASK).status_code == 201
    assert not (tmp_path / "test.db-wal").exists() and not (tmp_path / "test.db-shm").exists()


def test_restore_temp_names_unique(client, tmp_path, monkeypatch):
    seen = []
    real_validate = backup_service.validate
    monkeypatch.setattr(backup_service, "validate", lambda path: seen.append(path) or real_validate(path))
    data = download(client)
    restore(client, data)
    restore(client, data)
    assert len(seen) == 2 and seen[0] != seen[1]
    assert [p for p in tmp_path.iterdir() if p.name.endswith(".przywracanie-tmp")] == []


def test_last_backup_kept_after_restore(client):
    data = download(client)
    before = client.get("/api/settings").json()["database"]["last_backup_at"]
    assert before is not None
    restore(client, data)
    assert client.get("/api/settings").json()["database"]["last_backup_at"] == before
