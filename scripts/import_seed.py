"""Import gotowego zestawu zadań z pliku JSON (folder seeds/).

Użycie:
    python scripts/import_seed.py seeds/python_variables.json
    python scripts/import_seed.py seeds/python_variables.json --db inna_baza.db

Plik: lista zadań z polami title, language, kind, description, solution, tests
oraz opcjonalnie difficulty (domyślnie "easy"), tags, starter_code, hint.
Zadania o tym samym tytule i języku, które już są w bazie, są pomijane.
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.core.database import connect  # noqa: E402
from backend.services.importer import ImportFormatError, import_tasks, preview_import  # noqa: E402


def import_seed(json_path: str, con: sqlite3.Connection, now: datetime) -> tuple[int, int]:
    # Ta sama logika co okno „Importuj” w aplikacji (backend/services/importer.py), bez uruchamiania rozwiązań
    with open(json_path, encoding="utf-8") as f:
        text = f.read()
    items = preview_import(con, text)
    skipped = 0
    for item in items:
        if item["status"] == "invalid":
            title = item["title"] or f"#{item['index'] + 1}"
            print(f"Pominięto „{title}”: {item['message']}")
        if item["status"] != "new":
            skipped += 1
    result = import_tasks(con, [item["task"] for item in items if item["status"] == "new"], now)
    return result["imported"], skipped + result["skipped"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import zadań z pliku JSON")
    parser.add_argument("json_file", help="plik z zadaniami, np. seeds/python_variables.json")
    parser.add_argument("--db", default=os.environ.get("LEETREPEAT_DB", os.path.join(ROOT, "leetrepeat.db")),
                        help="baza (domyślnie leetrepeat.db obok main.py)")
    args = parser.parse_args()
    if not os.path.isfile(args.json_file):
        print(f"Nie znaleziono pliku: {args.json_file}")
        sys.exit(1)
    con = connect(args.db)
    try:
        imported, skipped = import_seed(args.json_file, con, datetime.now().replace(microsecond=0))
    except ImportFormatError as error:
        print(error)
        sys.exit(1)
    finally:
        con.close()
    print(f"Zaimportowano {imported} zadań, pominięto {skipped} (już istnieją).")
