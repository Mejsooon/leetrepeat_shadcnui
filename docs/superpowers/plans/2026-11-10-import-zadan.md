# Import zadań z JSON — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** okno „Importuj” na ekranie Zadania: wklejony albo wybrany JSON → podgląd ze statusami i sprawdzeniem rozwiązań → „Importuj N zadań”.

**Architektura:** backend (`services/importer.py`) parsuje, waliduje przez `TaskIn`, wykrywa duplikaty i zapisuje w jednej transakcji; dwa nowe endpointy `/api/import/preview` i `/api/import`. Frontend (`ImportDialog.tsx`) pokazuje podgląd i po kolei woła istniejące `/api/run` z `solution`. `scripts/import_seed.py` używa tego samego serwisu.

**Stos:** FastAPI + Pydantic v2 + SQLite (pytest), React 19 + TS + Tailwind 4 + shadcn/ui (Vitest + Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-import-zadan-design.md` (rozszerza `2026-11-08-leetrepeat-v3-design.md`). Czytaj oba.

## Ograniczenia globalne

- Odpowiedzi, komentarze i teksty UI **po polsku**; liczebniki przez `plural()` z `frontend/src/lib/plural.ts` (zwraca np. „3 zadania” — z liczbą).
- **Prosty, liniowy kod** — bez rozbijania na małe funkcje pomocnicze (`CLAUDE.md`). Funkcje serwisu: `preview_import` i `import_tasks`, nic więcej publicznego.
- **SQL tylko w `backend/repository/`**, decyzje w `backend/services/`, adresy w `backend/api/routes.py`.
- Limity: **100 zadań**, **1 MB** (1 048 576 bajtów UTF-8) na import.
- Duplikat = ten sam `title` (po przycięciu) i `language`, porównanie dokładne.
- Domyślne `difficulty` = `easy`; nieznane pola ignorowane.
- Po każdej zmianie frontendu: `cd frontend && npm run build` i commit `frontend/dist` razem ze zmianami.
- TDD: najpierw test, który pada.
- Komponenty shadcn: `npx shadcn@latest add <nazwa>` w `frontend/`; gdy CLI nie ma sieci — skopiować źródło z `shadcn-ui/ui` (rejestr `new-york-v4`, importy z pakietu `radix-ui`, jak reszta `components/ui`).
- Testy: `.venv/bin/pytest -q`, `cd frontend && npx vitest run`, `npx tsc -b`, `npm run e2e`.

## Review Focus

1. **Blok kodu z końcami linii Windows** (`"```json\r\n[...]\r\n```"`, wklejone na Windows) — ma się sparsować jak zwykły. Test w Zadaniu 1.
2. **Tekst AI z opisem wokół bloku** („Oto zadania:” + blok) — spec nie wymaga wycinania, ale użytkownik musi dostać czytelny komunikat 422 „Nieprawidłowy JSON w linii 1, kolumnie 1”, a nie 500. Test w Zadaniu 1.
3. **Polskie znaki a limit 1 MB** — limit liczony w bajtach UTF-8, nie w znakach (600 000 × „ą” = 1,2 MB → 413). Test w Zadaniu 3.
4. **Ctrl+A, Ctrl+V w niepustym polu** — wklejenie, po którym pole zawiera wyłącznie wklejony tekst, też uruchamia podgląd. Test w Zadaniu 5.
5. **Podwójne kliknięcie „Importuj”** — przycisk nieaktywny w trakcie żądania; jedno `POST /api/import`. Test w Zadaniu 7.

---

### Zadanie 1: `task_exists` + `preview_import`

**Pliki:**
- Modyfikuj: `backend/repository/tasks.py` (nowa funkcja na końcu)
- Utwórz: `backend/services/importer.py`
- Test: `tests/test_importer.py` (nowy), `tests/test_tasks_service.py` (dopisać jeden test)

**Interfejsy:**
- Używa: `TaskIn` (`backend/api/schemas.py`), `polish_message` (`backend/api/errors.py`), `create_task` (`backend/services/tasks.py`, w testach do przygotowania bazy).
- Daje:
  - `repo.task_exists(con: sqlite3.Connection, title: str, language: str) -> bool`
  - `class ImportFormatError(Exception)` — `str(error)` = polski komunikat
  - `preview_import(con: sqlite3.Connection, text: str) -> list[dict]`; element: `{"index": int, "title": str | None, "language": str | None, "status": "new" | "duplicate" | "invalid", "message": str, "task": dict | None}`; `task` = `TaskIn(...).model_dump()` tylko dla `new`, `message` = `""` dla `new`.

- [ ] **Krok 1: Testy, które padają**

W `tests/test_tasks_service.py`:
```python
def test_task_exists(db):
    create_task(db, make(), NOW)        # make() i NOW są już w pliku; dopisz import: from backend.repository import tasks as repo
    assert repo.task_exists(db, "Two Sum", "python") is True
    assert repo.task_exists(db, "Two Sum", "csharp") is False
```

W `tests/test_importer.py` (stała `TASK` = poprawne zadanie Python `function` z 1 testem, `json.dumps([TASK])` jako wejście):

| Test | Asercja |
|---|---|
| `test_preview_new_task` | 1 element, `status == "new"`, `message == ""`, `task["difficulty"] == "easy"` (TASK bez `difficulty`), `task["tags"] == []` |
| `test_preview_strips_code_fence` | wejście ``"```json\n" + json.dumps([TASK]) + "\n```"`` → `status == "new"`; to samo z ``"```\n…\n```"`` |
| `test_preview_strips_code_fence_crlf` | ``"```json\r\n" + … + "\r\n```\r\n"`` → `status == "new"` (Review Focus 1) |
| `test_preview_single_object` | `json.dumps(TASK)` → 1 element `new` |
| `test_preview_invalid_json` | `'[{"title": }'` → `ImportFormatError`, `str(e) == "Nieprawidłowy JSON w linii 1, kolumnie 12"` |
| `test_preview_prose_around_block` | `"Oto zadania:\n```json\n[]\n```"` → `ImportFormatError`, komunikat zaczyna się od `"Nieprawidłowy JSON w linii 1"` (Review Focus 2) |
| `test_preview_not_a_list` | `"42"` → `"Oczekiwano listy zadań"` |
| `test_preview_empty_list` | `"[]"` → `"Brak zadań do importu"` |
| `test_preview_too_many` | 101 zadań (różne tytuły) → `"Najwyżej 100 zadań naraz — podziel plik"`; 100 zadań → bez błędu |
| `test_preview_element_not_object` | `'[1]'` → `status == "invalid"`, `message == "To nie jest zadanie"`, `title is None` |
| `test_preview_invalid_field` | TASK z `tests: []` → `invalid`, `message == "tests: Dodaj co najmniej jeden test"`; TASK z `language: "java"` → `message == "language: Niedozwolona wartość"`; TASK bez `tests[0].expected` → `message == "tests.0.expected: Brak wymaganego pola"` |
| `test_preview_ignores_unknown_fields` | TASK + `"hints": "x"` → `new` |
| `test_preview_duplicate_in_db` | po `create_task(db, TASK…)` → `duplicate`, `"Już jest w bibliotece"` |
| `test_preview_duplicate_in_file` | `[TASK, TASK z tytułem "  " + title + " "]` → `[new, duplicate]`, drugi `"Powtórzone w pliku"` |
| `test_preview_seed_file` | treść `seeds/python_variables.json` → 10 elementów, wszystkie `new` |

- [ ] **Krok 2: Uruchom — padają**

`.venv/bin/pytest tests/test_importer.py tests/test_tasks_service.py::test_task_exists -q` → FAIL (`ModuleNotFoundError: backend.services.importer`, `AttributeError: task_exists`).

- [ ] **Krok 3: Zaimplementuj**

`task_exists`: `SELECT 1 FROM tasks WHERE title = ? AND language = ?`.

`preview_import` — jedna liniowa funkcja, kolejność jak w specu §4:
1. `stripped = text.strip()`; jeśli zaczyna się od ```` ``` ```` i kończy ```` ``` ````: odetnij pierwszą linię (do pierwszego `\n`) i końcowe ```` ``` ````. `\r` zostaje i jest białym znakiem dla `json.loads`.
2. `json.loads`; `json.JSONDecodeError as e` → `ImportFormatError(f"Nieprawidłowy JSON w linii {e.lineno}, kolumnie {e.colno}")`.
3. `dict` → `[dict]`; nie lista → błąd; `[]` → błąd; `len > 100` → błąd.
4. Pętla po `enumerate`: zbiór `seen` par `(title.strip(), language)` z poprawnych zadań; tytuł/język do wyniku brane z elementu tylko gdy są tekstem; `difficulty` przez `setdefault` na kopii elementu; komunikat błędu walidacji = `".".join(str(p) for p in err["loc"]) + ": " + polish_message(err)` dla `ValidationError.errors()[0]`.

- [ ] **Krok 4: Uruchom — przechodzą**

`.venv/bin/pytest tests/test_importer.py tests/test_tasks_service.py -q` → PASS.

- [ ] **Krok 5: Commit**

```bash
git add backend/repository/tasks.py backend/services/importer.py tests/test_importer.py tests/test_tasks_service.py
git commit -m "Import: podgląd zadań z JSON (preview_import, task_exists)"
```

---

### Zadanie 2: `import_tasks` + `import_seed.py` na wspólnym serwisie

**Pliki:**
- Modyfikuj: `backend/services/importer.py`, `scripts/import_seed.py`
- Test: `tests/test_importer.py`, `tests/test_import.py` (istniejące testy seeda muszą przejść bez zmian)

**Interfejsy:**
- Używa: `preview_import`, `repo.task_exists`, `create_task(con, data, now) -> int`.
- Daje: `import_tasks(con: sqlite3.Connection, tasks: list[dict], now: datetime) -> dict` → `{"imported": int, "skipped": int}`; `tasks` = słowniki w kształcie `TaskIn.model_dump()`. Sygnatura `import_seed(json_path, con, now) -> tuple[int, int]` bez zmian.

- [ ] **Krok 1: Testy, które padają** (w `tests/test_importer.py`)

| Test | Asercja |
|---|---|
| `test_import_tasks_saves_tests_and_tags` | `import_tasks(db, [task z tags=["Listy"] i 2 testami], NOW) == {"imported": 1, "skipped": 0}`; `get_task(db, id, TODAY)` ma 2 testy i `tags == ["Listy"]`, status zadania `new` |
| `test_import_tasks_skips_duplicate_added_after_preview` | podgląd → `create_task` tego samego → `import_tasks` z `task` z podglądu → `{"imported": 0, "skipped": 1}` |
| `test_import_tasks_rollback` | `monkeypatch` `backend.services.importer.create_task` tak, by drugie wywołanie rzucało `RuntimeError`; `pytest.raises(RuntimeError)`; potem `SELECT COUNT(*) FROM tasks` == 0 |

- [ ] **Krok 2: Uruchom — padają** (`ImportError: import_tasks`).

- [ ] **Krok 3: Zaimplementuj**

`import_tasks`: pętla z `repo.task_exists` / `create_task`, w `try`; `except Exception: con.rollback(); raise`; po pętli `con.commit()`. W `importer.py` importuj `create_task` jako nazwę modułową (`from backend.services.tasks import create_task`), żeby `monkeypatch` działał.

`import_seed.py`: zamiast własnej pętli i SQL — `text = open(..., encoding="utf-8").read()`, `items = preview_import(con, text)`; dla `invalid` wypisz `Pominięto „{title}”: {message}` (jak dziś); `result = import_tasks(con, [i["task"] for i in items if i["status"] == "new"], now)`; zwróć `(result["imported"], result["skipped"] + liczba duplicate + liczba invalid)`. `ImportFormatError` w `__main__` → wypisz komunikat, `sys.exit(1)`.

- [ ] **Krok 4: Uruchom — przechodzą**

`.venv/bin/pytest -q` → PASS (w tym `test_seed_file_imports`, `test_seed_defaults`, `test_import_seed_skips_invalid`).

- [ ] **Krok 5: Commit**

```bash
git add backend/services/importer.py scripts/import_seed.py tests/test_importer.py
git commit -m "Import: zapis w jednej transakcji; import_seed na wspólnym serwisie"
```

---

### Zadanie 3: Endpointy `/api/import/preview` i `/api/import`

**Pliki:**
- Modyfikuj: `backend/api/schemas.py`, `backend/api/routes.py`
- Test: `tests/test_api_import.py` (nowy)

**Interfejsy:**
- Używa: `preview_import`, `import_tasks`, `ImportFormatError`, `TaskIn`.
- Daje (HTTP):
  - `POST /api/import/preview` body `ImportPreviewIn {text: str}` → 200 `{"items": [...]}` | 413 `{"detail": "Tekst jest za duży (najwyżej 1 MB)"}` | 422 `{"detail": "<komunikat ImportFormatError>"}`
  - `POST /api/import` body `ImportIn {tasks: list[TaskIn]}` (`Field(min_length=1, max_length=100)`) → 201 `{"imported", "skipped"}` | 422

- [ ] **Krok 1: Testy, które padają** (fixture `client` z `conftest.py`)

| Test | Asercja |
|---|---|
| `test_preview_ok` | 200, `items[0]["status"] == "new"` |
| `test_preview_bad_json` | 422, `detail` zaczyna się od `"Nieprawidłowy JSON"` |
| `test_preview_too_large_bytes` | `text = "ą" * 600_000` → 413, `detail == "Tekst jest za duży (najwyżej 1 MB)"` (Review Focus 3) |
| `test_import_creates` | `POST /api/import` z `task` z podglądu → 201 `{"imported": 1, "skipped": 0}`; `GET /api/tasks` → `total == 1` |
| `test_import_validates` | `{"tasks": []}` → 422; zadanie bez `solution` → 422 |
| `test_import_blocked_cross_site` | nagłówek `Origin: https://zla-strona.pl` → 403 dla obu endpointów |

- [ ] **Krok 2: Uruchom — padają** (404).

- [ ] **Krok 3: Zaimplementuj** — wzorzec jak `create_task` w `routes.py` (`connect` / `try` / `finally close`); rozmiar sprawdzany przez `len(body.text.encode("utf-8")) > 1_048_576`; `ImportFormatError` → `HTTPException(422, str(error))`; `import_tasks` z `[t.model_dump() for t in body.tasks]` i `datetime.now().replace(microsecond=0)`.

- [ ] **Krok 4: Uruchom — przechodzą** — `.venv/bin/pytest -q` → PASS.

- [ ] **Krok 5: Commit**

```bash
git add backend/api/schemas.py backend/api/routes.py tests/test_api_import.py
git commit -m "API: /import/preview i /import"
```

---

### Zadanie 4: `api.ts` + instrukcja dla AI

**Pliki:**
- Modyfikuj: `frontend/src/api.ts`
- Utwórz: `frontend/src/lib/importPrompt.ts`
- Test: `frontend/src/api.import.test.ts`, `frontend/src/lib/importPrompt.test.ts`

**Interfejsy:**
- Daje:
  - `type ImportStatus = "new" | "duplicate" | "invalid"`
  - `type ImportPreviewItem = { index: number; title: string | null; language: Language | null; status: ImportStatus; message: string; task: TaskInput | null }`
  - `previewImport(text: string): Promise<{ items: ImportPreviewItem[] }>` → `POST /import/preview`
  - `importTasks(tasks: TaskInput[]): Promise<{ imported: number; skipped: number }>` → `POST /import`
  - `export const IMPORT_PROMPT: string` w `lib/importPrompt.ts`

- [ ] **Krok 1: Testy, które padają**

`api.import.test.ts` (wzorzec z `api.tasks.test.ts`): `previewImport("x")` woła `/api/import/preview` metodą `POST` z body `{"text":"x"}`; `importTasks([t])` → `/api/import`, body `{"tasks":[t]}`.

`importPrompt.test.ts`:
```ts
it("instrukcja zawiera poprawny przykład w formacie importu", () => {
  const block = IMPORT_PROMPT.match(/```json\n([\s\S]*?)\n```/)![1]
  const tasks = JSON.parse(block)
  expect(tasks).toHaveLength(2)
  expect(tasks.map((t: { kind: string }) => t.kind)).toEqual(["function", "program"])
  expect(tasks.map((t: { language: string }) => t.language)).toEqual(["python", "csharp"])
  for (const t of tasks) for (const key of ["title", "language", "kind", "description", "solution", "tests"]) expect(t).toHaveProperty(key)
})
it("instrukcja wymaga odpowiedzi samym blokiem JSON", () => {
  expect(IMPORT_PROMPT).toContain("Odpowiedz wyłącznie jednym blokiem kodu JSON")
})
```

- [ ] **Krok 2: Uruchom — padają** (`npx vitest run src/api.import.test.ts src/lib/importPrompt.test.ts`).

- [ ] **Krok 3: Zaimplementuj** — treść `IMPORT_PROMPT` według specu §3 (punkty 1–6), jeden przykład w jednym bloku ```` ```json ```` z listą 2 zadań. Przykłady: Python `function` (np. `suma_parzystych(lista)`, 3 testy, `expected` jako JSON) i C# `program` (wczytuje liczbę z `Console.ReadLine()`, wypisuje jej podwojenie; testy `"4"` → `"8"`). Wcześniej sprawdź oba przykłady ręcznie przez `.venv/bin/python -c "from backend.services.runner import run_tests; …"` (C# tylko gdy jest `dotnet`). Ostatnia linijka: `Temat zadań: ` (użytkownik dopisuje).

- [ ] **Krok 4: Uruchom — przechodzą** + `npx tsc -b`.

- [ ] **Krok 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/api.import.test.ts frontend/src/lib/importPrompt.ts frontend/src/lib/importPrompt.test.ts
git commit -m "Frontend: API importu i instrukcja dla AI"
```

---

### Zadanie 5: `ImportDialog` — krok 1 (wklejanie, plik, podgląd)

**Pliki:**
- Utwórz: `frontend/src/components/ImportDialog.tsx`, `frontend/src/components/ui/checkbox.tsx` (shadcn)
- Test: `frontend/src/components/ImportDialog.test.tsx`

**Interfejsy:**
- Używa: `previewImport`, `IMPORT_PROMPT`, `ApiError`, komponenty `Dialog`, `Textarea`, `Button`, `Alert`, `Checkbox`.
- Daje: `export default function ImportDialog({ onImported }: { onImported: () => void })` — renderuje własny przycisk-wyzwalacz „Importuj” (`variant="outline"`, ikona `Upload`) i okno. Tytuł okna: „Importuj zadania”.

Etykiety (dokładne): pole `aria-label="JSON z zadaniami"`; przyciski „Skopiuj instrukcję dla AI” / „Skopiowano ✓”, „Wybierz plik…”, „Sprawdź”, „Anuluj”, „Wstecz”; linijka ostrzeżenia ze specu §5 dosłownie.

- [ ] **Krok 1: Testy, które padają** (`render(<ImportDialog onImported={vi.fn()} />)`, fetch przez `stubApi`; podgląd z 3 elementami `new` / `duplicate` / `invalid`)

| Test | Asercja |
|---|---|
| `kopiuje instrukcję` | `navigator.clipboard.writeText` (atrapa) wywołane z `IMPORT_PROMPT`; widać „Skopiowano ✓”; po 2 s (fake timers) znów „Skopiuj instrukcję dla AI” |
| `wklejenie do pustego pola uruchamia podgląd` | `userEvent.paste` → jedno żądanie `/api/import/preview`; widać 3 wiersze z tytułami |
| `Ctrl+A i wklejenie też uruchamia podgląd` | pole z tekstem „abc”, zaznacz wszystko, `paste` → żądanie z wklejonym tekstem (Review Focus 4) |
| `pisanie nie uruchamia podglądu; Sprawdź tak` | `type` → 0 żądań; „Sprawdź” → 1; „Sprawdź” nieaktywne przy pustym polu |
| `plik trafia do pola i uruchamia podgląd` | `userEvent.upload` pliku `.json` → pole zawiera treść, 1 żądanie |
| `za duży plik` | `File` z `size` > 1 048 576 → „Plik jest za duży (najwyżej 1 MB)”, 0 żądań |
| `błąd 422 pod polem` | odpowiedź 422 `{"detail": "Nieprawidłowy JSON w linii 1, kolumnie 2"}` → ten tekst widoczny, pole zachowuje treść |
| `statusy duplikatu i błędu` | wiersze `duplicate` / `invalid`: komunikat z backendu, checkbox `disabled` i niezaznaczony |
| `Wstecz wraca z tym samym tekstem` | po podglądzie „Wstecz” → pole z poprzednim tekstem |

- [ ] **Krok 2: Uruchom — padają.**

- [ ] **Krok 3: Zaimplementuj** — stan: `step: "paste" | "preview" | "done"`, `text`, `error`, `items`. Wykrywanie wklejenia (Review Focus 4): w `onPaste` zapamiętaj `pasted = event.clipboardData.getData("text")`; w `onChange` uruchom podgląd, gdy `event.target.value === pasted`. Plik: `file.size` przed `file.text()`; wyjątek `file.text()` → „Nie udało się odczytać pliku”. Wiersz `new` w tym zadaniu: zaznaczony checkbox, status „sprawdzam…” (sprawdzanie dochodzi w Zadaniu 6). Checkbox z `aria-label={tytuł}`; brak tytułu → wyświetlane i w `aria-label` „(bez tytułu) #N” (N = `index + 1`). Input pliku: `accept=".json,application/json"`, ukryty, otwierany przyciskiem „Wybierz plik…”.

- [ ] **Krok 4: Uruchom — przechodzą** + `npx tsc -b`.

- [ ] **Krok 5: Commit**

```bash
git add frontend/src/components/ImportDialog.tsx frontend/src/components/ImportDialog.test.tsx frontend/src/components/ui/checkbox.tsx frontend/package.json frontend/package-lock.json
git commit -m "Okno importu: wklejanie, plik, podgląd"
```

---

### Zadanie 6: `ImportDialog` — sprawdzanie rozwiązań

**Pliki:**
- Modyfikuj: `frontend/src/components/ImportDialog.tsx`
- Test: `frontend/src/components/ImportDialog.test.tsx`

**Interfejsy:**
- Używa: `runTests({ language, kind, code: task.solution, tests: task.tests })` z `api.ts`.
- Stan wiersza: `check: "pending" | "pass" | "fail" | "missing" | "error"` + `failed`/`total` dla `fail`; `checked: boolean`.

- [ ] **Krok 1: Testy, które padają** (atrapa `fetch` sterowana ręcznie dla `/api/run`)

| Test | Asercja |
|---|---|
| `wszystkie testy przechodzą` | `results` same `pass` → „Rozwiązanie przechodzi testy”, checkbox zaznaczony |
| `część nie przechodzi` | 2 × `fail`/`error`/`timeout` z 5 → „Nie przechodzi 2 z 5 testów”, checkbox **odznaczony**, da się zaznaczyć |
| `brak środowiska` | 503 dla zadania C# → „Nie sprawdzono (brak .NET)”; dla Pythona → „(brak Pythona)”; zaznaczony |
| `inny błąd` | 500 → „Nie udało się sprawdzić”, zaznaczony |
| `po kolei` | 2 zadania: drugie `/api/run` dopiero po odpowiedzi na pierwsze; nad listą „Sprawdzam rozwiązania: 1 z 2…” |
| `przycisk w trakcie` | „Importuj …” nieaktywny, dopóki trwa sprawdzanie |
| `licznik z odmianą` | 3 zaznaczone → „Importuj 3 zadania”; 1 → „Importuj 1 zadanie”; 0 → przycisk nieaktywny |
| `Wstecz przerywa` | „Wstecz” w trakcie → brak kolejnych `/api/run`, spóźniona odpowiedź nie zmienia stanu (brak ostrzeżeń `act`) |
| `zamknięcie przerywa` | zamknięcie okna w trakcie → brak kolejnych `/api/run` |

- [ ] **Krok 2: Uruchom — padają.**

- [ ] **Krok 3: Zaimplementuj** — pętla `for` z `await` po wierszach `new` w jednym `useEffect` uruchamianym po wejściu w krok „preview”; przerwanie przez lokalną flagę `cancelled` ustawianą w funkcji sprzątającej efektu (wyjście z kroku lub zamknięcie okna). `ApiError.status === 503` → `missing`.

- [ ] **Krok 4: Uruchom — przechodzą** + `npx tsc -b`.

- [ ] **Krok 5: Commit**

```bash
git add frontend/src/components/ImportDialog.tsx frontend/src/components/ImportDialog.test.tsx
git commit -m "Okno importu: sprawdzanie rozwiązań przez /api/run"
```

---

### Zadanie 7: Import, wynik i przycisk na ekranie Zadania

**Pliki:**
- Modyfikuj: `frontend/src/components/ImportDialog.tsx`, `frontend/src/pages/Zadania.tsx`
- Test: `frontend/src/components/ImportDialog.test.tsx`, `frontend/src/pages/Zadania.test.tsx`

**Interfejsy:**
- Używa: `importTasks(tasks: TaskInput[])`, `onImported()`.
- W `Zadania.tsx`: stan `reload` (licznik) dopisany do zależności efektu listy (`[query, setParams, reload]`) i efektu liczników/tagów, jeśli są osobne; `<ImportDialog onImported={() => setReload((n) => n + 1)} />` obok „Dodaj zadanie” (nagłówek) i obok „Dodaj pierwsze zadanie” (pusty stan).

- [ ] **Krok 1: Testy, które padają**

| Test | Asercja |
|---|---|
| `importuje zaznaczone` | odznacz 1 z 3 → „Importuj 2 zadania” → `POST /api/import` z dokładnie 2 zadaniami (`task` z podglądu) |
| `wynik` | odpowiedź `{imported: 2, skipped: 0}` → „Zaimportowano 2 zadania”; `{imported: 1, skipped: 1}` → „Zaimportowano 1 zadanie, pominięto 1 — już istnieją”; `onImported` wywołane raz; „Zamknij” zamyka okno |
| `podwójne kliknięcie` | dwa szybkie kliknięcia → jedno żądanie `/api/import`; przycisk nieaktywny w trakcie (Review Focus 5) |
| `błąd importu` | 500 → „Nie zaimportowano żadnego zadania — spróbuj ponownie”, wiersze i zaznaczenia zostają |
| `Zadania.test.tsx: przycisk w nagłówku i w pustym stanie` | `getByRole("button", { name: "Importuj" })` przy liście i przy `EMPTY_LIST` |
| `Zadania.test.tsx: odświeża listę po imporcie` | po zakończonym imporcie kolejne żądanie `/api/tasks` |

- [ ] **Krok 2: Uruchom — padają.**

- [ ] **Krok 3: Zaimplementuj** — liczebnik w „pominięto” bez odmiany słowa („pominięto 1 — już istnieją”) zgodnie ze specem; tekst „Zaimportowano …” przez `plural(n, "zadanie", "zadania", "zadań")`.

- [ ] **Krok 4: Uruchom — przechodzą** — `npx vitest run` i `npx tsc -b`.

- [ ] **Krok 5: Commit**

```bash
git add frontend/src/components/ImportDialog.tsx frontend/src/components/ImportDialog.test.tsx frontend/src/pages/Zadania.tsx frontend/src/pages/Zadania.test.tsx
git commit -m "Import zadań na ekranie Zadania"
```

---

### Zadanie 8: E2E, dokumentacja, `dist`

**Pliki:**
- Utwórz: `frontend/e2e/import.spec.ts`
- Modyfikuj: `README.md`, `docs/superpowers/rulings.md`, `frontend/dist/**`

- [ ] **Krok 1: Test E2E** — `import.spec.ts` (`mode: "serial"` jak w `zadania.spec.ts`): `/zadania` → „Importuj” → wklej (`page.getByLabel("JSON z zadaniami")` + schowek albo `fill` + „Sprawdź”) 2 zadania Python o unikalnych tytułach → poczekaj, aż „Importuj 2 zadania” będzie aktywny → klik → „Zaimportowano 2 zadania” → „Zamknij” → oba tytuły w tabeli. Na koniec usuń oba zadania przez API (`request.delete`), żeby nie psuć innych plików e2e.

- [ ] **Krok 2: Uruchom** — `cd frontend && npm run e2e` → wszystkie PASS.

- [ ] **Krok 3: Dokumentacja**
  - `README.md`: sekcja „Import zadań od AI” — 4 kroki: „Importuj” → „Skopiuj instrukcję dla AI” → wklej do czatu z tematem → wklej odpowiedź i „Importuj N zadań”; uwaga, że `scripts/import_seed.py` nadal działa.
  - `rulings.md`: nowa sekcja „Import zadań (2026-11-10)” z dwoma wierszami ze specu §8 + wykrywanie wklejenia przez porównanie `value` z treścią schowka (Review Focus 4).

- [ ] **Krok 4: Build i pełna weryfikacja**

```bash
cd frontend && npm run build && npx tsc -b && npx vitest run && cd .. && .venv/bin/pytest -q
```
Wszystko PASS; `git status` pokazuje zmiany w `frontend/dist`.

- [ ] **Krok 5: Commit**

```bash
git add frontend/e2e/import.spec.ts README.md docs/superpowers/rulings.md frontend/dist
git commit -m "Import zadań: e2e, dokumentacja, zbudowany frontend"
```
