"""Kopia zapasowa bazy: eksport, sprawdzenie pliku i przywrócenie (spec §5 /backup, §6 „Zły plik kopii”)."""
import os
import sqlite3
import tempfile
from datetime import datetime

from backend.core.database import SCHEMA, connect
from backend.repository import settings as settings_repo

MAX_RESTORE_BYTES = 200 * 1024 * 1024
SQLITE_HEADER = b"SQLite format 3\x00"


def export_copy(db_path: str, dest_path: str) -> None:
    # backup API daje spójną kopię, nawet gdy ktoś akurat zapisuje do bazy
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(dest_path)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def _expected_columns() -> dict[str, set[str]]:
    # Tabele i kolumny wzięte prosto z SCHEMA — jedno źródło prawdy
    con = sqlite3.connect(":memory:")
    con.executescript(SCHEMA)
    tables = [row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    result = {table: {row[1] for row in con.execute(f"PRAGMA table_info({table})")} for table in tables}
    con.close()
    return result


def validate(path: str) -> str | None:
    """None = plik to poprawna baza LeetRepeat; inaczej polski komunikat, co jest nie tak."""
    with open(path, "rb") as f:
        if f.read(16) != SQLITE_HEADER:
            return "To nie jest plik bazy danych"
    try:
        # Zwykłe otwarcie, nie URI: „file:…” psuje ścieżki z #, ? i %xx (np. folder „C#projekty”).
        # To nasz własny plik tymczasowy, więc tryb tylko-do-odczytu nie jest potrzebny.
        con = sqlite3.connect(path)
        try:
            check = con.execute("PRAGMA integrity_check").fetchone()[0]
            if check != "ok":
                return "Plik bazy jest uszkodzony"
            for table, columns in _expected_columns().items():
                found = {row[1] for row in con.execute(f"PRAGMA table_info({table})")}
                if not found:
                    return f"To nie jest baza LeetRepeat (brak tabeli {table})"
                missing = sorted(columns - found)
                if missing:
                    return f"To nie jest baza LeetRepeat (brak kolumny {table}.{missing[0]})"
        finally:
            con.close()
    except sqlite3.DatabaseError:
        return "Plik bazy jest uszkodzony"
    return None


def _free_backup_path(db_path: str, now: datetime) -> str:
    base = f"{db_path}.przed-przywroceniem-{now:%Y%m%d-%H%M%S}"
    path = base + ".db"
    number = 2
    while os.path.exists(path):               # dwa przywrócenia w tej samej sekundzie → -2, -3…
        path = f"{base}-{number}.db"
        number += 1
    return path


def restore(db_path: str, data: bytes, now: datetime) -> dict:
    """Zastępuje bazę zawartością pliku. Najpierw sprawdzenie (ValueError, nic nie zmienione),
    potem kopia obecnej bazy obok, na końcu nadpisanie przez backup API."""
    # Unikalny plik tymczasowy obok bazy — dwa przywracania naraz (dwie karty) sobie nie przeszkadzają
    fd, temp_path = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(db_path)), suffix=".przywracanie-tmp")
    os.close(fd)
    try:
        with open(temp_path, "wb") as f:
            f.write(data)
        error = validate(temp_path)
        if error:
            raise ValueError(error)

        con = connect(db_path)
        try:
            last_backup_at = settings_repo.get_all(con).get("last_backup_at")
        finally:
            con.close()

        backup_path = _free_backup_path(db_path, now)
        export_copy(db_path, backup_path)
        export_copy(temp_path, db_path)

        con = connect(db_path)
        try:
            # Kopia mogła być w trybie WAL — wracamy do jednego pliku bazy (bez -wal / -shm)
            con.execute("PRAGMA journal_mode=DELETE")
            # „Ostatnia kopia” dotyczy Twoich kopii, nie daty zapisanej w przywróconym pliku
            if last_backup_at:
                settings_repo.set_many(con, {"last_backup_at": last_backup_at})
                con.commit()
            tasks = con.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        finally:
            con.close()
        return {"tasks": tasks, "backup_path": os.path.abspath(backup_path)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
