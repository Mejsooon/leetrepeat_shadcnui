"""Import zadań i testów ze starej bazy LeetRepeat v2 (spec §7).

Użycie:
    python scripts/import_v2.py ŚCIEŻKA/DO/STAREJ/leetrepeat.db
    python scripts/import_v2.py stara.db --db inna_nowa_baza.db

Historia ocen nie jest przenoszona — wszystkie zadania startują jako Nowe.
Zadania o tym samym tytule i języku, które już są w nowej bazie, są pomijane (import można powtarzać).
"""
import argparse
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


def import_v2(old_db_path: str, new_con: sqlite3.Connection, now: datetime) -> tuple[int, int]:
    # Stara baza tylko do odczytu — import nigdy jej nie zmienia
    old = sqlite3.connect(f"file:{old_db_path}?mode=ro", uri=True)
    old.row_factory = sqlite3.Row
    imported = skipped = 0
    for task in old.execute("SELECT * FROM tasks ORDER BY id").fetchall():
        exists = new_con.execute("SELECT 1 FROM tasks WHERE title = ? AND language = ?",
                                 (task["title"], task["language"])).fetchone()
        if exists:
            skipped += 1
            continue
        tests = [dict(t) for t in old.execute(
            "SELECT input, expected FROM tests WHERE task_id = ? ORDER BY position", (task["id"],))]
        data = {
            "title": task["title"], "language": task["language"], "kind": task["kind"], "difficulty": "easy",
            "description": task["description"], "starter_code": task["starter_code"], "hint": task["hint"],
            "solution": task["solution"], "tests": tests, "tags": [],
        }
        # Ta sama walidacja co w formularzu — niepoprawne zadanie pomijamy z komunikatem
        try:
            TaskIn(**data)
        except ValidationError as error:
            print(f"Pominięto „{task['title']}”: {polish_message(error.errors()[0])}")
            skipped += 1
            continue
        create_task(new_con, data, now)
        imported += 1
    old.close()
    new_con.commit()
    return imported, skipped


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import zadań z LeetRepeat v2")
    parser.add_argument("old_db", help="ścieżka do starej bazy leetrepeat.db (v2)")
    parser.add_argument("--db", default=os.environ.get("LEETREPEAT_DB", os.path.join(ROOT, "leetrepeat.db")),
                        help="nowa baza (domyślnie leetrepeat.db obok main.py)")
    args = parser.parse_args()
    if not os.path.isfile(args.old_db):
        print(f"Nie znaleziono pliku: {args.old_db}")
        sys.exit(1)
    con = connect(args.db)
    imported, skipped = import_v2(args.old_db, con, datetime.now().replace(microsecond=0))
    con.close()
    print(f"Zaimportowano {imported} zadań, pominięto {skipped} (już istnieją).")
