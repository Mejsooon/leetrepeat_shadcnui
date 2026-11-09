"""SQL tabeli settings (klucz → wartość tekstowa)."""
import sqlite3


def get_all(con: sqlite3.Connection) -> dict[str, str]:
    return {row["key"]: row["value"] for row in con.execute("SELECT key, value FROM settings")}


def set_many(con: sqlite3.Connection, values: dict[str, str]) -> None:
    con.executemany(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        list(values.items()))
