"""Ustawienia (spec §3 settings): ścieżki i limity Pythona / .NET, sprawdzanie środowiska."""
import functools
import shutil
import sqlite3
import subprocess
import sys

from backend.repository import settings as repo

PATH_KEYS = ("python_path", "dotnet_path")
TIMEOUT_KEYS = ("python_timeout_s", "csharp_timeout_s")


def _version(program: str, timeout_s: float) -> str | None:
    """Pierwsza linia `program --version` albo None, gdy programu nie ma, nie działa albo za długo myśli."""
    try:
        result = subprocess.run([program, "--version"], capture_output=True, text=True, timeout=timeout_s)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    # dotnet pisze wersję na stdout, stary Python na stderr
    text = (result.stdout or result.stderr).strip()
    return text.splitlines()[0] if text else None


@functools.cache
def detect_python() -> str:
    # Pierwszy kandydat, który istnieje i naprawdę jest Pythonem 3
    # (na Windows „python3” bywa fałszywym skrótem do Sklepu)
    for candidate in ("python3", "py", "python", sys.executable):
        path = shutil.which(candidate) if candidate else None
        if path is None:
            continue
        version = _version(path, 5)
        if version and version.startswith("Python 3"):
            return path
    return sys.executable


def defaults() -> dict:
    return {"python_path": detect_python(), "dotnet_path": "dotnet", "python_timeout_s": 5, "csharp_timeout_s": 20}


def get_settings(con: sqlite3.Connection) -> dict:
    stored = repo.get_all(con)
    values = defaults()
    for key in PATH_KEYS:
        if stored.get(key):
            values[key] = stored[key]
    for key in TIMEOUT_KEYS:
        if stored.get(key, "").isdigit():
            values[key] = int(stored[key])
    return {"values": values, "defaults": defaults()}


def save_settings(con: sqlite3.Connection, values: dict) -> dict:
    repo.set_many(con, {key: str(values[key]) for key in PATH_KEYS + TIMEOUT_KEYS})
    return get_settings(con)


def runner_options(con: sqlite3.Connection, language: str) -> dict:
    values = get_settings(con)["values"]
    timeout = values["python_timeout_s"] if language == "python" else values["csharp_timeout_s"]
    return {"python_path": values["python_path"], "dotnet_path": values["dotnet_path"], "timeout_s": timeout}


def check_runtimes(con: sqlite3.Connection) -> dict:
    values = get_settings(con)["values"]
    result = {}
    for name, key in (("python", "python_path"), ("dotnet", "dotnet_path")):
        given = values[key]
        resolved = shutil.which(given)
        version = _version(resolved, 10) if resolved else None
        if version is None:
            result[name] = {"found": False, "version": None, "path": given}
        else:
            result[name] = {"found": True, "version": version, "path": resolved}
    return result
