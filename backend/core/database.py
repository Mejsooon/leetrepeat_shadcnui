"""Baza danych SQLite (spec §3). Tabele tworzą się same przy połączeniu."""
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY,
    title         TEXT NOT NULL,
    language      TEXT NOT NULL,              -- 'python' | 'csharp'
    kind          TEXT NOT NULL,              -- 'function' | 'program'
    difficulty    TEXT NOT NULL,              -- 'easy' | 'medium' | 'hard'
    description   TEXT NOT NULL,              -- treść w Markdown
    starter_code  TEXT NOT NULL DEFAULT '',
    hint          TEXT NOT NULL DEFAULT '',
    solution      TEXT NOT NULL,
    notes         TEXT NOT NULL DEFAULT '',   -- notatki użytkownika z sesji
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    interval_days REAL NOT NULL DEFAULT 0,    -- 0 = nowe albo po „Znowu”
    due_date      TEXT NOT NULL               -- YYYY-MM-DD
);

CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE -- „Tablice” i „tablice” to ten sam tag
);

CREATE TABLE IF NOT EXISTS task_tags (
    task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tests (
    id        INTEGER PRIMARY KEY,
    task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    position  INTEGER NOT NULL,
    input     TEXT NOT NULL,                  -- wywołanie funkcji albo stdin
    expected  TEXT NOT NULL                   -- JSON albo oczekiwany stdout
);

CREATE TABLE IF NOT EXISTS reviews (
    id               INTEGER PRIMARY KEY,
    task_id          INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    rating           TEXT NOT NULL,           -- 'again' | 'hard' | 'good' | 'easy'
    reviewed_at      TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,        -- od otwarcia zadania do oceny
    tests_passed     INTEGER,                 -- NULL = testów nie uruchomiono
    tests_total      INTEGER,
    hint_used        INTEGER NOT NULL,
    solution_used    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
"""


def connect(path: str) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row                 # wiersze dostępne po nazwie kolumny
    con.execute("PRAGMA foreign_keys = ON")       # bez tego ON DELETE CASCADE nie działa
    con.executescript(SCHEMA)
    return con
