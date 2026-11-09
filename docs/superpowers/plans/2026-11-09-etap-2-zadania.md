# LeetRepeat v3 — Etap 2: Zadania — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Można dodawać, edytować, usuwać i przeglądać zadania (z tagami, trudnością, testami) w bibliotece z filtrami i paginacją, a zadania ze starej bazy v2 i seedy da się zaimportować.

**Architecture:** Backend: SQL w `backend/repository/tasks.py`, decyzje (status, walidacja tagów, daty) w `backend/services/tasks.py`, endpointy w `backend/api/routes.py` + modele w `backend/api/schemas.py`. Frontend: funkcje w `api.ts`, ekrany `Zadania.tsx` i `ZadanieForm.tsx`, edytor kodu Monaco wbudowany w `dist` (offline). Router przechodzi na „data router” (`createBrowserRouter`), bo ostrzeżenie o niezapisanych zmianach wymaga `useBlocker`.

**Tech Stack:** jak w Etapie 1 + `monaco-editor`, `@monaco-editor/react`, `react-markdown`, komponenty shadcn/ui: `table`, `select`, `textarea`, `label`, `command`, `popover`, `alert-dialog`, `toggle-group`, `kbd`, `pagination`, `empty`.

**Spec:** `docs/superpowers/specs/2026-11-08-leetrepeat-v3-design.md` (sekcje 3, 4 „Pojęcia wyliczane”, 5, 6, 7, 9 pkt 2)

## Global Constraints

- Wszystko z Etapu 1 nadal obowiązuje: `127.0.0.1:8000`, offline (zero CDN), `frontend/dist` commitowany, teksty po polsku, prosty liniowy kod, komentarze po polsku.
- Komponenty shadcn/ui: rejestr może być niedostępny — wtedy kopiuj z `shadcn-ui/ui` (`apps/v4/registry/new-york-v4/ui`) i przepisz importy na `@/components/ui`, `@/lib/utils`, `@/hooks` (jak w Etapie 1).
- Wartości z bazy: `language` `python`│`csharp`; `kind` `function`│`program`; `difficulty` `easy`│`medium`│`hard`; status `new`│`due`│`learning`│`consolidated`.
- Etykiety w UI: Python / C#; Łatwe / Średnie / Trudne; Nowe / Do powtórki / W nauce / Utrwalone.
- Nowe zadanie: `interval_days = 0`, `due_date = dziś`, `created_at = updated_at = teraz` (ISO, sekundy). Edycja zmienia `updated_at`, nigdy `interval_days`/`due_date`/historii.
- Status (spec §4): Nowe = brak ocen; Do powtórki = ma oceny i `due_date ≤ dziś`; W nauce = odstęp < 21; Utrwalone = odstęp ≥ 21.
- Lista: sortowanie po `due_date` rosnąco, potem `id`; `page_size` domyślnie 10.
- Zadanie ma ≥ 1 test; tytuł, treść i rozwiązanie niepuste po obcięciu spacji.

## Review Focus

1. Szukanie i tagi z polskimi literami bez rozróżniania wielkości („łańcuchy” znajduje „Łańcuchy”; tag „Łańcuchy” i „łańcuchy” to jeden tag) — SQLite `LIKE`/`NOCASE` działa tylko dla ASCII. — Task 1
2. Strona spoza zakresu (np. `page=3`, gdy po usunięciu zostały 2 strony) → pusta lista z poprawnym `pages`; frontend przeskakuje na ostatnią stronę zamiast pokazać „brak zadań”. — Task 2 i Task 6
3. Opuszczenie formularza z niezapisanymi zmianami (klik w panel boczny, „Anuluj”, zamknięcie karty) → pytanie o potwierdzenie; po zapisie — bez pytania. — Task 7
4. Tytuł z samych spacji, test bez wywołania, zadanie bez testów → 422 z polskim komunikatem w API i komunikat pod polem we frontendzie. — Task 2 i Task 7
5. Edytor kodu nie ciągnie niczego z internetu (domyślny loader Monaco używa CDN jsdelivr) — formularz działa offline. — Task 5

---

### Task 1: Repozytorium i serwis zadań (SQL, tagi, status)

**Files:**
- Modify: `backend/core/database.py` (rejestracja funkcji `pylower` w `connect`)
- Create: `backend/repository/__init__.py`, `backend/repository/tasks.py`, `backend/services/tasks.py`
- Test: `tests/test_tasks_service.py`

**Interfaces:**
- Consumes: `connect(path)` (Etap 1).
- Produces (`backend/services/tasks.py` — jedyne wejście dla API i skryptów):
  - `create_task(con, data: dict, now: datetime) -> int` — `data` ma klucze: `title, language, kind, difficulty, description, starter_code, hint, solution, tests: list[{input, expected}], tags: list[str]`
  - `update_task(con, task_id: int, data: dict, now: datetime) -> bool` (False = brak zadania)
  - `get_task(con, task_id: int, today: date) -> dict | None` — wszystkie kolumny + `tests` (wg `position`), `tags` (alfabetycznie), `status`, `last_reviewed_at` (`None` gdy brak ocen)
  - `delete_task(con, task_id: int) -> bool`
  - `update_notes(con, task_id: int, notes: str) -> bool`
  - `list_tasks(con, today: date, q: str = "", language: str | None = None, difficulty: str | None = None, status: str | None = None, tag: str | None = None, page: int = 1, page_size: int = 10) -> dict` → `{"items": [{id, title, tags, language, difficulty, due_date, status}], "total": int, "page": int, "pages": int, "counts": {"library": int, "due": int, "new": int}}` — `counts` liczone dla CAŁEJ biblioteki (nagłówek „24 zadania · 6 do powtórki dziś · 3 nowe”), bez filtrów
  - `list_tags(con) -> list[{"name": str, "count": int}]` — alfabetycznie
  - Decyzja planu: `counts` w odpowiedzi listy nie ma w spec §5, ale ekran z designu go potrzebuje — dodajemy je tu zamiast osobnego endpointu.
  - `task_status(review_count: int, due_date: str, interval_days: float, today: date) -> str`
- Produces: w `connect` funkcja SQL `pylower(text)` = Pythonowe `str.lower()` (działa z polskimi literami).

Uwagi: cały SQL w `repository/tasks.py` (funkcje o nazwach jak w serwisie, przyjmujące gotowe wartości); serwis liczy daty, status i normalizuje tagi. Tagi: obcięte spacje, puste pominięte, duplikaty bez rozróżniania wielkości liter (`casefold`) usunięte; istniejący tag dopasowywany po `casefold` (zachowuje pisownię pierwszego użycia); tagi bez zadań usuwane po każdym zapisie i usunięciu zadania. Szukanie `q`: `pylower(title) LIKE ?` lub `pylower(description) LIKE ?` z `%q.lower()%`. Filtr statusu i `tag` w SQL (status przez `EXISTS (SELECT 1 FROM reviews …)` i porównanie `due_date`/`interval_days`). `pages = max(1, ceil(total / page_size))`.

- [ ] **Step 1: Testy** w `tests/test_tasks_service.py` (fixture `db`; `TODAY = date(2026, 11, 9)`, `NOW = datetime(2026, 11, 9, 10, 0)`; pomocniczy słownik `TASK` z poprawnymi danymi):

```python
def test_create_and_get_task(db):            # due_date = dziś, interval 0, status new, testy w kolejności, last_reviewed_at None
def test_update_keeps_schedule(db):          # po ręcznym UPDATE interval_days=5,due_date=2026-11-12 → update_task nie zmienia ich, zmienia updated_at
def test_update_missing_returns_false(db)
def test_delete_cascades_and_drops_orphan_tags(db)   # list_tags() == [] po usunięciu jedynego zadania z tagiem
def test_tags_normalized(db):                # tags=[" Tablice ", "tablice", "", "Stos"] → ["Stos", "Tablice"]
def test_polish_tag_case_insensitive(db):    # Review Focus 1: zadanie A z "Łańcuchy", B z "łańcuchy" → list_tags() == [{"name": "Łańcuchy", "count": 2}]
def test_search_polish_case_insensitive(db): # Review Focus 1: tytuł "Łańcuch znaków", q="ŁAŃCUCH" i q="łańcuch" → 1 wynik; szuka też w description
def test_task_status_rules():
    assert task_status(0, "2026-11-01", 0, TODAY) == "new"
    assert task_status(2, "2026-11-09", 3, TODAY) == "due"
    assert task_status(2, "2026-11-12", 20.9, TODAY) == "learning"
    assert task_status(2, "2026-12-20", 21, TODAY) == "consolidated"
def test_list_filters_and_sorting(db):       # 3 zadania z różnymi due_date/językiem/trudnością/tagiem; każdy filtr osobno zwraca właściwe id; bez filtrów kolejność wg due_date
def test_list_status_filter(db):             # zadanie z oceną i due_date dziś → status="due" je zwraca, status="new" nie
def test_pagination_and_counts(db):          # 23 zadania, page=3 → 3 elementy, pages=3, total=23; counts liczone bez filtrów
def test_page_out_of_range(db):              # Review Focus 2: 12 zadań, page=5 → items == [], pages == 2, total == 12
def test_update_notes(db)
```

- [ ] **Step 2:** `pytest tests/test_tasks_service.py -v` → FAIL (`ModuleNotFoundError: backend.services.tasks`).
- [ ] **Step 3:** Zaimplementuj `pylower` w `connect` (`con.create_function("pylower", 1, …, deterministic=True)`, `None` → `None`), `repository/tasks.py` i `services/tasks.py` wg Interfaces.
- [ ] **Step 4:** `pytest -q` → wszystko passed (testy C# skipped bez dotnet).
- [ ] **Step 5: Commit** — `feat: repozytorium i serwis zadań z tagami i statusem`

### Task 2: API zadań i tagów

**Files:**
- Create: `backend/api/schemas.py`
- Modify: `backend/api/routes.py`
- Test: `tests/test_api_tasks.py`

**Interfaces:**
- Consumes: wszystkie funkcje serwisu z Task 1.
- Produces (spec §5): `GET /api/tasks?q=&language=&difficulty=&status=&tag=&page=1&page_size=10` (odpowiedź = `list_tasks`), `GET /api/tasks/{id}`, `POST /api/tasks` (201, `{"id": int}`), `PUT /api/tasks/{id}` (`{"id": int}`), `PATCH /api/tasks/{id}/notes` (`{"notes": str}` → `{"ok": true}`), `DELETE /api/tasks/{id}` (204), `GET /api/tags`.
- Produces: `TaskIn` (pydantic): `title`, `description`, `solution` — `str`, po `strip()` niepuste; `language: Literal["python","csharp"]`, `kind: Literal["function","program"]`, `difficulty: Literal["easy","medium","hard"]`, `starter_code: str = ""`, `hint: str = ""`, `tests: list[TestIn]` (min 1), `tags: list[str] = []`; `TestIn.input`/`expected`: `str`. Dla `kind="function"` `input` po `strip()` niepusty (dla `program` stdin może być pusty). `NotesIn.notes: str`.
- Komunikaty walidacji po polsku (pole `detail[].msg`): „Pole nie może być puste”, „Dodaj co najmniej jeden test”, „Wywołanie funkcji nie może być puste”.
- Każde żądanie: `con = connect(db_path)` w `try/finally` z `commit()`/`close()`; `today = date.today()`, `now = datetime.now().replace(microsecond=0)`.
- `page < 1` lub `page_size` poza 1–100 → 422.

- [ ] **Step 1: Testy** (`client` z `tests/test_app.py` przenieś do `conftest.py` jako wspólny fixture):

```python
def test_create_get_roundtrip(client):        # POST → 201 {"id"}; GET zwraca title, tags, tests, status "new", due_date dziś
def test_special_characters_roundtrip(client): # tytuł 'Cytat "x" & <y> 🎯', test input z \n i cudzysłowami → GET zwraca identycznie
def test_whitespace_title_rejected(client):    # Review Focus 4: title="   " → 422, msg "Pole nie może być puste"
def test_no_tests_rejected(client)             # tests=[] → 422 "Dodaj co najmniej jeden test"
def test_empty_function_call_rejected(client)  # kind=function, test input " " → 422; kind=program, input "" → 201
def test_list_filters_via_query(client)        # ?language=csharp&difficulty=medium&tag=Stos&q=nawias
def test_page_beyond_range(client)             # Review Focus 2: ?page=9 → 200, items [], pages ≥ 1
def test_put_updates_and_404(client)           # PUT zmienia tytuł; PUT /api/tasks/999 → 404 "Nie znaleziono zadania"
def test_patch_notes(client)                   # PATCH → GET pokazuje notes
def test_delete_then_404(client)               # DELETE 204 → GET 404
def test_tags_endpoint(client)                 # GET /api/tags → [{"name","count"}]
```

- [ ] **Step 2:** `pytest tests/test_api_tasks.py -v` → FAIL (404 na `/api/tasks`).
- [ ] **Step 3:** Zaimplementuj `schemas.py` i endpointy w `create_router`. Komunikaty walidacji przez `field_validator`/`model_validator` z `ValueError("…")` (pydantic doda prefiks „Value error, ” — w testach sprawdzaj `in msg`).
- [ ] **Step 4:** `pytest -q` → passed.
- [ ] **Step 5: Commit** — `feat: API zadań i tagów`

### Task 3: Import z v2 i seedy w formacie v3

**Files:**
- Create: `scripts/import_v2.py`, `scripts/import_seed.py`, `seeds/python_variables.json`
- Test: `tests/test_import.py`

**Interfaces:**
- Consumes: `create_task`, `connect`.
- Produces: `import_v2(old_db_path: str, new_con, now: datetime) -> tuple[int, int]` (zaimportowane, pominięte) w `scripts/import_v2.py`; CLI: `python scripts/import_v2.py STARA_BAZA [--db NOWA_BAZA]` (domyślnie `LEETREPEAT_DB` albo `leetrepeat.db` obok `main.py`), wypisuje „Zaimportowano N zadań, pominięto M (już istnieją).”
- Produces: `import_seed(json_path: str, con, now: datetime) -> tuple[int, int]` w `scripts/import_seed.py`; CLI analogiczne.
- Spec §7: `difficulty = "easy"`, `tags = []`, `notes = ""`, odstęp 0, termin dziś; duplikat = ten sam `title` i `language` (pomijany). Stara baza otwierana tylko do odczytu (`sqlite3.connect(f"file:{path}?mode=ro", uri=True)`); nieistniejący plik → komunikat „Nie znaleziono pliku: …” i kod wyjścia 1.
- Seed v3: lista obiektów jak w v2 + `difficulty` i `tags`. `seeds/python_variables.json` = plik z v2 (`Mejsooon/leetrepeat`, `seeds/python_variables.json`) z dodanym `"difficulty": "easy"` i `"tags": ["Zmienne"]` w każdym zadaniu. Brak `difficulty`/`tags` w seedzie → `easy` / `[]`.

- [ ] **Step 1: Testy:** fixture tworzy bazę w schemacie v2 (skopiuj `SCHEMA` z v2 `core/database.py` do testu) z 2 zadaniami (python function z 2 testami, csharp program z 1 testem) i 1 oceną.

```python
def test_import_v2_copies_tasks_and_tests(...)   # (2, 0); nowe zadania: difficulty easy, tags [], status new, testy w kolejności
def test_import_v2_skips_duplicates(...)         # drugi import → (0, 2)
def test_import_v2_ignores_reviews(...)          # w nowej bazie tabela reviews pusta
def test_import_v2_missing_file_exits(...)       # subprocess CLI z nieistniejącą ścieżką → returncode 1, "Nie znaleziono pliku"
def test_seed_file_imports(...)                  # seeds/python_variables.json → (10, 0), każde ma tag "Zmienne"
```

- [ ] **Step 2:** FAIL → **Step 3:** implementacja → **Step 4:** `pytest -q` passed.
- [ ] **Step 5: Commit** — `feat: import zadań z v2 i seedów`

### Task 4: Data router, typy API i licznik zadań w panelu

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/App.test.tsx`, `frontend/src/components/AppSidebar.test.tsx`, `frontend/src/api.ts`, `frontend/src/components/AppLayout.tsx`
- Create: `frontend/src/test/renderApp.tsx`, `frontend/src/api.tasks.test.ts`

**Interfaces:**
- Produces: `routes: RouteObject[]` w `App.tsx` (te same ścieżki co w Etapie 1, wszystkie jako dzieci `AppLayout`); `App` = `ThemeProvider` + `RouterProvider router={createBrowserRouter(routes)}`.
- Produces: `renderApp(path: string)` w `test/renderApp.tsx` — `mockMatchMedia(false)`, `ThemeProvider`, `RouterProvider` z `createMemoryRouter(routes, { initialEntries: [path] })`; zwraca wynik `render`. Testy tras używają go.
- Produces w `api.ts` (typy 1:1 z odpowiedziami Task 2): `Language`, `Kind`, `Difficulty`, `Status`, `TestCase {input, expected}`, `TaskInput`, `Task` (pełne), `TaskListItem`, `TaskList {items, total, page, pages, counts}`, `TaskFilters {q?, language?, difficulty?, status?, tag?, page?}`, `Tag {name, count}`; funkcje `listTasks(filters)`, `getTask(id)`, `createTask(input) → {id}`, `updateTask(id, input) → {id}`, `deleteTask(id)`, `updateNotes(id, notes)`, `listTags()`. `listTasks` buduje query string tylko z niepustych pól.
- Produces: etykiety w `frontend/src/labels.ts`: `LANGUAGE_LABEL`, `DIFFICULTY_LABEL`, `STATUS_LABEL`, `KIND_LABEL` (wartości z Global Constraints; `KIND_LABEL`: function → „Funkcja”, program → „Program (wejście/wyjście)”).
- `AppLayout` pobiera `listTasks({ page: 1 })` przy każdej zmianie `location.pathname` i przekazuje `counts.library` jako `taskCount` do `AppSidebar` (błąd → licznik ukryty).

- [ ] **Step 1: Testy:** `api.tasks.test.ts` — `listTasks({ q: "ab", language: "python", page: 2 })` woła `/api/tasks?q=ab&language=python&page=2`; `listTasks({ q: "" })` woła `/api/tasks`; `deleteTask(3)` używa metody `DELETE` i zwraca `null` przy 204. Istniejące testy tras przepisz na `renderApp` (`fetch` zastubowany na `{items:[],total:0,page:1,pages:1,counts:{library:24,due:0,new:0}}`) i dodaj: `it("panel pokazuje liczbę zadań z API")` → tekst „24”.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** `npm test` → PASS; `npm run build`.
- [ ] **Step 5: Commit** — `feat: data router, typy API zadań i licznik w panelu` (z `dist`)

### Task 5: Edytor kodu (Monaco offline)

**Files:**
- Create: `frontend/src/components/CodeEditor.tsx`, `frontend/src/components/CodeEditorMonaco.tsx`, `frontend/src/components/CodeEditor.test.tsx`
- Modify: `frontend/package.json` (`monaco-editor`, `@monaco-editor/react`)

**Interfaces:**
- Produces: `CodeEditor` w `CodeEditor.tsx` z propsami `{ value: string; onChange: (v: string) => void; language: "python" | "csharp" | "plaintext"; fileName: string; ariaLabel: string; height?: number; readOnly?: boolean }`. Wygląd z designu: pasek z nazwą pliku po lewej i „Python 3.12 · UTF-8” / „C# · .NET 10” / „Tekst” po prawej, ramka `rounded-md border`. W środku `Suspense` z fallbackiem `<textarea aria-label={ariaLabel}>` (ta sama wartość i `onChange` — działa, zanim Monaco się wczyta albo gdyby się nie wczytał) i `React.lazy(() => import("./CodeEditorMonaco"))`.
- `CodeEditorMonaco.tsx`: `import * as monaco from "monaco-editor"`, `loader.config({ monaco })` z `@monaco-editor/react`, `self.MonacoEnvironment = { getWorker: () => new EditorWorker() }` z `monaco-editor/esm/vs/editor/editor.worker?worker` — bez CDN. Edytor z numerami linii, Geist Mono 13 px, bez minimapy, motyw `vs` / `vs-dark` wg `useTheme().resolved`, `aria-label` przekazany do `options.ariaLabel`.
- W testach jsdom Monaco nie działa: `vi.mock("@/components/CodeEditorMonaco", () => new Promise(() => {}))` zostawia fallback; testy formularza (Task 7) mockują cały `@/components/CodeEditor` prostą `<textarea>`.

- [ ] **Step 1: Test** `CodeEditor.test.tsx`: renderuje fallback z `aria-label` i wartością, wywołuje `onChange` przy pisaniu w fallbacku; pokazuje „two_sum.py” i „Python 3.12 · UTF-8”.
- [ ] **Step 2:** FAIL → **Step 3:** implementacja → **Step 4:** `npm test` PASS.
- [ ] **Step 5:** `npm run build`; `grep -rE "cdn.jsdelivr|unpkg|fonts.googleapis" frontend/dist` → brak (Review Focus 5); edytor ładuje się osobnym plikiem (`ls frontend/dist/assets | grep -i editor`).
- [ ] **Step 6: Commit** — `feat: edytor kodu Monaco działający offline` (z `dist`)

### Task 6: Ekran „Zadania” (biblioteka)

**Files:**
- Modify: `frontend/src/pages/Zadania.tsx`
- Create: `frontend/src/pages/Zadania.test.tsx`; komponenty shadcn: `table`, `select`, `badge` (jest), `kbd`, `pagination`, `empty`, `input` (jest)

**Interfaces:**
- Consumes: `listTasks`, `listTags`, etykiety z `labels.ts`.
- Wygląd i teksty 1:1 z artboardów `Zadania.dc.html` i `Zadania-puste.dc.html`:
  - nagłówek „Twoje zadania”, podtytuł „{library} zadań · {due} do powtórki dziś · {new} nowe” (odmiana: 1 zadanie / 2–4 zadania / 5+ zadań), przycisk „Dodaj zadanie” → `/zadania/nowe`;
  - pasek: pole „Szukaj po tytule lub treści…” z `Kbd` „⌘ K” (`Ctrl+K`/`⌘+K` w dowolnym miejscu ekranu ustawia fokus), Selecty „Język”, „Trudność”, „Status”, „Tag” (opcja „wszystkie”);
  - tabela: Tytuł zadania (tytuł + tagi pod spodem, link do `/sesja?zadanie={id}` — Etap 3 obsłuży ten adres jako sesję z jednym zadaniem), Język (Badge outline), Trudność (Badge: easy → success, medium → warning, hard → destructive-muted), Następna powtórka (`Dzisiaj` / `Jutro` / `9 lis 2026`; dla Nowych „—”), Status (Badge: due → info, learning → warning, consolidated → success, new → secondary), kolumna akcji z linkiem „Edytuj” (ikona ołówka, `aria-label="Edytuj {tytuł}"`);
  - stopka: „{od}–{do} z {total} zadań”, „Strona {page} z {pages}”, przyciski „Poprzednia”/„Następna”;
  - pusta biblioteka (`counts.library === 0`) → stan z artboardu „pierwsze uruchomienie” (3 kroki, „Dodaj pierwsze zadanie”); filtry bez wyników → „Brak zadań dla tych filtrów” + przycisk „Wyczyść filtry”.
- Filtry i strona w adresie URL (`useSearchParams`), szukanie z opóźnieniem 300 ms. Gdy `page > pages` → automatycznie `page = pages` (Review Focus 2).

- [ ] **Step 1: Testy** (`renderApp("/zadania…")`, `fetch` zastubowany wg URL):

```tsx
it("pokazuje wiersze z etykietami po polsku")            // "Two Sum", "Python", "Łatwe", "Do powtórki", "Dzisiaj"
it("podtytuł z licznikami i odmianą")                    // counts {library:24,due:6,new:3} → "24 zadania · 6 do powtórki dziś · 3 nowe"
it("pusta biblioteka pokazuje pierwsze kroki")           // "Dodaj pierwsze zadanie"
it("brak wyników filtrów pokazuje 'Wyczyść filtry'")     // klik czyści URL
it("wpisanie szukanej frazy woła API z q po 300 ms")     // vi.useFakeTimers
it("Ctrl+K ustawia fokus na wyszukiwarce")
it("strona spoza zakresu przeskakuje na ostatnią")       // Review Focus 2: ?page=5, odpowiedź pages=2, items [] → kolejne wywołanie z page=2
it("Następna zmienia stronę w adresie")
```

- [ ] **Step 2:** FAIL → **Step 3:** implementacja → **Step 4:** `npm test` PASS, `npm run build`.
- [ ] **Step 5: Commit** — `feat: biblioteka zadań z filtrami i paginacją` (z `dist`)

### Task 7: Formularz zadania (dodawanie, edycja, usuwanie)

**Files:**
- Modify: `frontend/src/pages/ZadanieForm.tsx`, `frontend/src/components/AppLayout.tsx`, `frontend/src/components/SiteHeader.tsx` (bez zmian w propsach)
- Create: `frontend/src/pages/ZadanieForm.test.tsx`, `frontend/src/components/TagInput.tsx`, `frontend/src/headerStatus.tsx`; komponenty shadcn: `textarea`, `label`, `command`, `popover`, `alert-dialog`, `toggle-group`
- Modify: `frontend/package.json` (`react-markdown`)

**Interfaces:**
- Consumes: `getTask`, `createTask`, `updateTask`, `deleteTask`, `listTags`, `CodeEditor`, etykiety.
- Produces: `HeaderStatusProvider` + `useHeaderStatus(): (node: ReactNode | null) => void` w `headerStatus.tsx`; `AppLayout` przekazuje ustawiony węzeł do `SiteHeader status`, domyślnie „Zapisano lokalnie” (ikona check, kolor success).
- Produces: `TagInput` props `{ value: string[]; onChange: (tags: string[]) => void; suggestions: string[] }` — Enter lub przecinek dodaje tag, `×` przy tagu usuwa (`aria-label="Usuń tag {nazwa}"`), podpowiedzi (`Command` w `Popover`) filtrowane bez rozróżniania wielkości liter, bez tagów już wybranych.
- Pola i teksty z artboardów `Dodawanie.dc.html` / `Edycja.dc.html`: „Wróć do listy zadań”, „Dodaj zadanie” / „Edytuj zadanie”, plakietka „Szkic · jeszcze niezapisany” / „Niezapisane zmiany”; Tytuł zadania *, Język * (Select), Trudność * (Select z kropką koloru), **Typ zadania *** (ToggleGroup: Funkcja / Program (wejście/wyjście) — w designie go brak, spec §3 go wymaga), Tagi, Treść zadania * (pasek „Markdown”, B, I — wstawiają `**…**` / `_…_` wokół zaznaczenia — „Podgląd” przełącza na `react-markdown`), Podpowiedź (+ „Dostępna dopiero po wybraniu „Pokaż podpowiedź”.”), Kod startowy (CodeEditor), Testy * — lista wierszy z dwoma polami i przyciskiem usuń + „Dodaj test”; etykiety pól zależnie od typu: Funkcja → „Wywołanie” / „Oczekiwany wynik (JSON)”, Program → „Wejście (stdin)” / „Oczekiwane wyjście”; Rozwiązanie * (CodeEditor, plakietka „Ukryte podczas rozwiązywania”); stopka „* Pola wymagane · Po zapisie wrócisz do listy zadań.”, „Anuluj”, „Zapisz zadanie” / „Zapisz zmiany”. W edycji dodatkowo „Usuń zadanie” (wariant destructive) z `AlertDialog` „Usunąć zadanie „{tytuł}”? Historia powtórek też zostanie usunięta.”
- Walidacja na żywo (komunikaty pod polami, jak w Task 2: „Pole nie może być puste”, „Dodaj co najmniej jeden test”, „Wywołanie funkcji nie może być puste”), „Zapisz” nieaktywne, dopóki są błędy; błąd 422 z API pokazany w `Alert` nad stopką.
- Niezapisane zmiany: porównanie z wartościami startowymi; `useHeaderStatus` pokazuje „Zmiany niezapisane” (kropka warning); `useBlocker` + `AlertDialog` „Opuścić stronę? Niezapisane zmiany przepadną.” (Zostań / Opuść), `beforeunload` przy zamykaniu karty. Po zapisie i po usunięciu nawigacja bez pytania.
- Edycja nieistniejącego zadania (404) → „Nie znaleziono zadania” + link „Wróć do listy zadań”.

- [ ] **Step 1: Testy** (`vi.mock("@/components/CodeEditor", …)` z textarea; `fetch` zastubowany):

```tsx
it("zapisuje nowe zadanie i wraca do listy")          // wypełnij pola, Zapisz → POST /api/tasks z poprawnym JSON (tags, tests, kind), potem URL /zadania
it("pusty tytuł blokuje zapis z komunikatem")        // Review Focus 4: tytuł "   " → "Pole nie może być puste", przycisk disabled
it("typ Program zmienia etykiety testów")
it("tag dodawany Enterem, podpowiedź z listy, usuwany ×")
it("Podgląd renderuje Markdown")                      // "**gruby**" → <strong>
it("edycja wczytuje zadanie i wysyła PUT")
it("edycja nieistniejącego zadania pokazuje komunikat") // GET 404
it("usunięcie po potwierdzeniu woła DELETE i wraca do listy")
it("opuszczenie z niezapisanymi zmianami pyta o potwierdzenie") // Review Focus 3: zmiana tytułu, klik "Pulpit" w panelu → dialog; "Zostań" → nadal formularz; "Opuść" → Pulpit
it("po zapisie nie ma pytania o opuszczenie")
```

- [ ] **Step 2:** FAIL → **Step 3:** implementacja → **Step 4:** `npm test` PASS, `npm run build`.
- [ ] **Step 5: Commit** — `feat: formularz zadania z tagami, testami i ostrzeżeniem o zmianach` (z `dist`)

### Task 8: Test całości i README

**Files:**
- Create: `frontend/e2e/zadania.spec.ts`
- Modify: `README.md` (sekcja „Dane”: import z v2 i seedów; usunięcie zdania „Ekrany wypełnią się…” dla Zadań)

- [ ] **Step 1: Test e2e** (świeża baza z `playwright.config.ts`; `test.describe.configure({ mode: "serial" })`):

```ts
test("dodaj, znajdź, edytuj i usuń zadanie", async ({ page }) => {
  // /zadania pusty stan → "Dodaj pierwsze zadanie" → wypełnij: tytuł "Odwracanie listy", Python, Łatwe, Funkcja,
  // tag "Listy", treść, test "odwroc([1,2])" → "[2,1]", rozwiązanie (wpisane w Monaco: klik + keyboard.type)
  // Zapisz → lista ma wiersz "Odwracanie listy", panel boczny pokazuje "1"
  // szukaj "ODWRAC" → wiersz widoczny; szukaj "xyz" → "Brak zadań dla tych filtrów"
  // Edytuj → zmień tytuł → klik "Pulpit" → dialog → "Zostań" → Zapisz zmiany → lista ma nowy tytuł
  // Edytuj → Usuń zadanie → potwierdź → pusty stan
})
```
Przed testem wyczyść bazę (`e2e-test.db` usuwany w `globalSetup`).

- [ ] **Step 2:** `npm run e2e` → PASS (także stary `smoke.spec.ts`).
- [ ] **Step 3:** README: `python scripts/import_v2.py ŚCIEŻKA/DO/STAREJ/leetrepeat.db` i `python scripts/import_seed.py seeds/python_variables.json` z opisem (historia ocen nie jest przenoszona, duplikaty pomijane).
- [ ] **Step 4:** pełna weryfikacja: `pytest -q`, `cd frontend && npm test && npm run build`, `git status` czysty.
- [ ] **Step 5: Commit** — `docs: README importu i test e2e biblioteki zadań`
