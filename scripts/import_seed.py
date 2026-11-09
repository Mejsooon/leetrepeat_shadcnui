"""Import gotowego zestawu zadań z pliku JSON (folder seeds/).

Użycie:
    python scripts/import_seed.py seeds/python_variables.json
    python scripts/import_seed.py seeds/python_variables.json --db inna_baza.db

Plik: lista zadań z polami title, language, kind, description, solution, tests
oraz opcjonalnie difficulty (domyślnie "easy"), tags, starter_code, hint.
Zadania o tym samym tytule i języku, które już są w bazie, są pomijane.
"""
import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.core.database import connect  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from backend.api.errors import polish_message  # noqa: E402
from backend.api.schemas import TaskIn  # noqa: E402
from backend.services.tasks import create_task  # noqa: E402


def import_seed(json_path: str, con: sqlite3.Connection, now: datetime) -> tuple[int, int]:
    with open(json_path, encoding="utf-8") as f:
        tasks = json.load(f)
    imported = skipped = 0
    for task in tasks:
        exists = con.execute("SELECT 1 FROM tasks WHERE title = ? AND language = ?",
                             (task["title"], task["language"])).fetchone()
        if exists:
            skipped += 1
            continue
        data = {
            "title": task["title"], "language": task["language"], "kind": task["kind"],
            "difficulty": task.get("difficulty", "easy"), "description": task["description"],
            "starter_code": task.get("starter_code", ""), "hint": task.get("hint", ""),
            "solution": task["solution"], "tests": task["tests"], "tags": task.get("tags", []),
        }
        # Ta sama walidacja co w formularzu — niepoprawne zadanie pomijamy z komunikatem
        try:
            TaskIn(**data)
        except ValidationError as error:
            print(f"Pominięto „{task['title']}”: {polish_message(error.errors()[0])}")
            skipped += 1
            continue
        create_task(con, data, now)
        imported += 1
    con.commit()
    return imported, skipped


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
    imported, skipped = import_seed(args.json_file, con, datetime.now().replace(microsecond=0))
    con.close()
    print(f"Zaimportowano {imported} zadań, pominięto {skipped} (już istnieją).")
