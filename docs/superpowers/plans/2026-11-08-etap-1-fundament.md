# LeetRepeat v3 — Etap 1: Fundament — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Działający szkielet aplikacji: `python main.py` serwuje zbudowany frontend React z panelem bocznym, motywem jasny/ciemny/systemowy i 6 pustymi ekranami, a backend ma pełny schemat bazy v3 i przeniesiony runner Python/C#.

**Architecture:** FastAPI w `backend/` (warstwy `api/ services/ repository/ core/`) serwuje `/api/*` i statyczny `frontend/dist` z fallbackiem SPA. Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui, React Router, jeden `api.ts` z `fetch`. Zbudowany `dist/` jest commitowany.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, pydantic 2, sqlite3, pytest, httpx; Node 20+, Vite, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, React Router 7, lucide-react, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, Vitest, @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-leetrepeat-v3-design.md` (sekcje 2, 3, 6 i 9 pkt 1)

**Etapy 2–5** (Zadania, Sesja, Pulpit + Statystyki, Ustawienia) dostaną osobne plany po ukończeniu tego.

## Global Constraints

- Serwer: tylko `127.0.0.1:8000`; `TrustedHostMiddleware` z `allowed_hosts=["127.0.0.1", "localhost"]`.
- Offline: zero CDN i Google Fonts — wszystkie zasoby frontendu w `frontend/dist`.
- `frontend/dist` jest commitowany; `.gitignore` musi go wyjątkować (`!frontend/dist/`).
- Uruchomienie na co dzień: `python main.py` bez Node.js. Node tylko do `npm run build`.
- Baza: `leetrepeat.db` obok `main.py`, nadpisywalna zmienną `LEETREPEAT_DB`; plik w `.gitignore`.
- Teksty interfejsu po polsku (słownictwo z artefaktu Design).
- Styl kodu: prosty, liniowy, bez rozbijania logiki na wiele małych funkcji pomocniczych; komentarze po polsku.
- Motyw: klasa `dark` na `<html>`, klucz `localStorage` = `leetrepeat-theme`, wartości `light` │ `dark` │ `system`, domyślnie `system`.
- Limity runnera domyślnie: Python 5 s, C# 20 s.

## Review Focus

1. Odświeżenie przeglądarki na `/statystyki` (głęboki link) → ma pokazać aplikację (index.html), nie 404. — Task 3
2. Literówka w adresie API, np. `/api/zadanka` → JSON 404, nie strona HTML aplikacji. — Task 3
3. Żądanie z obcym nagłówkiem `Host` (DNS rebinding) → 400, zanim dotrze do API. — Task 3
4. Zmiana motywu systemu przy otwartej aplikacji w trybie „Systemowy” → motyw zmienia się bez odświeżania. — Task 5
5. Brak `frontend/dist` (np. ktoś usunął folder) → `python main.py` startuje i `/` mówi po polsku, co zrobić, zamiast wywalić się z wyjątkiem. — Task 3

---

### Task 1: Szkielet backendu i schemat bazy v3

**Files:**
- Create: `backend/__init__.py`, `backend/core/__init__.py`, `backend/core/database.py`
- Create: `requirements.txt`, `pytest.ini`, `tests/conftest.py`, `tests/test_database.py`
- Modify: `.gitignore` (dopisać `leetrepeat.db`, `*.db-journal`, `node_modules/`, `!frontend/dist/`, `!frontend/dist/**`)

**Interfaces:**
- Produces: `backend.core.database.connect(path: str) -> sqlite3.Connection` — `row_factory = sqlite3.Row`, `PRAGMA foreign_keys = ON`, tworzy tabele ze spec §3 (`tasks`, `tags`, `task_tags`, `tests`, `reviews`, `settings`) przez `CREATE TABLE IF NOT EXISTS`.
- Produces: fixture `db` w `tests/conftest.py` → `connect(":memory:")`.

- [ ] **Step 1: Napisz testy schematu** w `tests/test_database.py`:

```python
def test_all_tables_exist(db):
    names = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"tasks", "tags", "task_tags", "tests", "reviews", "settings"} <= names

def test_tasks_columns(db):
    cols = {r["name"] for r in db.execute("PRAGMA table_info(tasks)")}
    assert cols == {"id", "title", "language", "kind", "difficulty", "description", "starter_code",
                    "hint", "solution", "notes", "created_at", "updated_at", "interval_days", "due_date"}

def test_reviews_columns(db):
    cols = {r["name"] for r in db.execute("PRAGMA table_info(reviews)")}
    assert cols == {"id", "task_id", "rating", "reviewed_at", "duration_seconds", "tests_passed",
                    "tests_total", "hint_used", "solution_used"}

def test_tag_names_unique_case_insensitive(db):
    db.execute("INSERT INTO tags(name) VALUES ('Tablice')")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO tags(name) VALUES ('tablice')")

def test_deleting_task_cascades(db):
    # INSERT: 1 zadanie, 1 test, 1 tag + task_tags, 1 ocena; potem DELETE FROM tasks WHERE id = 1
    assert db.execute("SELECT COUNT(*) FROM tests").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM task_tags").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0

def test_connect_twice_keeps_data(tmp_path):
    # connect → INSERT do settings → close → connect ponownie → wartość jest
```

- [ ] **Step 2:** `pytest tests/test_database.py -v` → FAIL (`ModuleNotFoundError: backend`).
- [ ] **Step 3: Zaimplementuj `connect`** w `backend/core/database.py`. Schemat jako jeden string `SCHEMA` z typami i domyślnymi wartościami dokładnie jak w spec §3 (`tags.name TEXT NOT NULL UNIQUE COLLATE NOCASE`, `task_tags` PK `(task_id, tag_id)`, wszystkie FK `ON DELETE CASCADE`, `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`). `requirements.txt`: `fastapi`, `uvicorn`, `pydantic>=2`, `pytest`, `httpx`. `pytest.ini`: `testpaths = tests`. `conftest.py` dodaje katalog repo do `sys.path`.
- [ ] **Step 4:** `pytest tests/test_database.py -v` → 6 passed.
- [ ] **Step 5: Commit** — `feat: schemat bazy v3`

### Task 2: Runner Python/C# z konfigurowalnymi ścieżkami i limitami

**Files:**
- Create: `backend/services/__init__.py`, `backend/services/runner.py`
- Create: `tests/test_runner_python.py`, `tests/test_runner_csharp.py`
- Źródło: `Mejsooon/leetrepeat` → `services/runner.py`, `tests/test_runner_python.py`, `tests/test_runner_csharp.py` (wersja z commita `34db549`)

**Interfaces:**
- Produces: `run_tests(language: str, kind: str, code: str, tests: list[dict], python_path: str | None = None, dotnet_path: str = "dotnet", timeout_s: float | None = None) -> list[dict]`. Każdy wynik: `{"status": "pass"|"fail"|"error"|"timeout", "input": str, "expected": str, "actual": str, "message": str}`. `python_path=None` → `sys.executable`; `timeout_s=None` → 5 dla Pythona, 20 dla C#.
- Produces: `class RuntimeMissing(Exception)` — komunikat po polsku.

- [ ] **Step 1: Przenieś testy** z v2 bez zmian w asercjach (import `from backend.services.runner import run_tests, RuntimeMissing`) i dopisz:

```python
def test_custom_timeout_is_used():
    r = run_tests("python", "program", "while True: pass\n", [{"input": "", "expected": ""}], timeout_s=1)
    assert r[0]["status"] == "timeout"          # test kończy się w ~1 s, nie 5 s

def test_missing_python_path_raises():
    with pytest.raises(RuntimeMissing):
        run_tests("python", "function", "def f(): return 1\n", [{"input": "f()", "expected": "1"}],
                  python_path="/nie/ma/takiego/pythona")

def test_missing_dotnet_path_raises():           # w test_runner_csharp.py, bez skipif
    with pytest.raises(RuntimeMissing):
        run_tests("csharp", "function", "static int F() => 1;", [{"input": "F()", "expected": "1"}],
                  dotnet_path="/nie/ma/dotnet")
```

- [ ] **Step 2:** `pytest tests/test_runner_python.py tests/test_runner_csharp.py -v` → FAIL (brak modułu).
- [ ] **Step 3: Przenieś `runner.py`** z v2 i zamień stałe `PYTHON_TIME_LIMIT`/`CSHARP_TIME_LIMIT`, `sys.executable` i `"dotnet"` na nowe parametry. Brakujący program wykrywaj przez `shutil.which(path)` (dla ścieżki absolutnej: `os.path.isfile`) → `RuntimeMissing("Nie znaleziono Pythona: <ścieżka>")` / `RuntimeMissing("Nie znaleziono dotnet: <ścieżka> — zainstaluj .NET 10 SDK")`. Reszta logiki (harness `@@i`, zabijanie drzewa procesów, normalizacja wyjścia) bez zmian.
- [ ] **Step 4:** ten sam pytest → wszystkie passed (testy C# bez `dotnet` → skipped, poza `test_missing_dotnet_path_raises`).
- [ ] **Step 5: Commit** — `feat: runner Python/C# z ustawialną ścieżką i limitem`

### Task 3: `main.py` — API, ochrona hosta, serwowanie frontendu (SPA)

**Files:**
- Create: `main.py`, `backend/api/__init__.py`, `backend/api/routes.py`
- Create: `tests/test_app.py`

**Interfaces:**
- Consumes: `connect` (Task 1).
- Produces: `create_app(db_path: str, dist_dir: str) -> FastAPI`; `backend.api.routes.create_router(db_path: str) -> APIRouter` z prefiksem `/api`.
- Produces: `GET /api/health` → `{"status": "ok", "version": "3.0.0"}` (używa go frontend w Task 6).

- [ ] **Step 1: Testy** w `tests/test_app.py` (fixture: `tmp_path/dist/index.html` z treścią `<div id="root"></div>`, `tmp_path/dist/assets/app.js`; klient `TestClient(app, base_url="http://127.0.0.1")`):

```python
def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "version": "3.0.0"}

def test_root_serves_index(client):
    assert 'id="root"' in client.get("/").text

def test_deep_link_serves_index(client):                       # Review Focus 1
    r = client.get("/statystyki")
    assert r.status_code == 200 and 'id="root"' in r.text

def test_asset_served(client):
    assert client.get("/assets/app.js").status_code == 200

def test_unknown_api_is_json_404(client):                      # Review Focus 2
    r = client.get("/api/zadanka")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")

def test_foreign_host_rejected(app):                           # Review Focus 3
    r = TestClient(app, base_url="http://evil.example").get("/api/health")
    assert r.status_code == 400

def test_missing_dist_explains(tmp_path):                      # Review Focus 5
    app = create_app(str(tmp_path / "x.db"), str(tmp_path / "brak"))
    r = TestClient(app, base_url="http://127.0.0.1").get("/")
    assert r.status_code == 503 and "npm run build" in r.text
```

- [ ] **Step 2:** `pytest tests/test_app.py -v` → FAIL.
- [ ] **Step 3: Zaimplementuj.** `main.py`: `create_app` dodaje `TrustedHostMiddleware`, `include_router(create_router(db_path))`, potem `app.mount("/assets", StaticFiles(directory=dist/assets))` i trasę `GET /{path:path}`: jeśli `path` zaczyna się od `api/` → `JSONResponse({"detail": "Not Found"}, 404)`; jeśli plik `dist/<path>` istnieje → `FileResponse`; inaczej `dist/index.html`; brak `index.html` → `HTMLResponse(503)` z tekstem „Brak zbudowanego frontendu (frontend/dist). Uruchom: cd frontend && npm install && npm run build”. Na dole: `app = create_app(os.environ.get("LEETREPEAT_DB", ROOT/"leetrepeat.db"), ROOT/"frontend/dist")` i `uvicorn.run(app, host="127.0.0.1", port=8000)`. `create_router` na razie zawiera tylko `/health`.
- [ ] **Step 4:** `pytest -v` → wszystko passed.
- [ ] **Step 5: Commit** — `feat: serwer FastAPI z fallbackiem SPA i ochroną hosta`

### Task 4: Szkielet frontendu (Vite + React + TS + Tailwind + shadcn/ui)

**Files:**
- Create: `frontend/` — `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `components.json`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/utils.ts`, `src/components/ui/*` (z shadcn), `src/pages/{Pulpit,Zadania,ZadanieForm,Sesja,Statystyki,Ustawienia}.tsx`, `src/test/setup.ts`, `src/App.test.tsx`

**Interfaces:**
- Produces: trasy React Router: `/` → `Pulpit`, `/zadania` → `Zadania`, `/zadania/nowe` i `/zadania/:id/edycja` → `ZadanieForm`, `/sesja` → `Sesja`, `/statystyki` → `Statystyki`, `/ustawienia` → `Ustawienia`. Każda strona na razie renderuje `<h1>` z nazwą ekranu („Pulpit”, „Twoje zadania”, „Dodaj zadanie”/„Edytuj zadanie”, „Powtórka”, „Statystyki”, „Ustawienia”).
- Produces: `App` przyjmuje opcjonalny prop `router?: "browser" | "memory"` (testy używają `MemoryRouter` z `initialEntries`) — albo równoważnie eksport `AppRoutes` renderowany w testach w `MemoryRouter`.

- [ ] **Step 1: Utwórz projekt:** `npm create vite@latest frontend -- --template react-ts`; dodaj Tailwind 4 (`@tailwindcss/vite`), alias `@` → `src`, `npx shadcn@latest init` (styl `new-york`, kolor bazowy `neutral`, CSS variables). Dodaj komponenty: `npx shadcn@latest add button card badge separator sidebar tooltip sheet alert`. Jeśli CLI nie ma dostępu do sieci rejestru — skopiuj źródła komponentów z repozytorium shadcn-ui (ta sama wersja), bez zmian. Czcionki: `@fontsource-variable/geist` i `@fontsource-variable/geist-mono` importowane w `main.tsx`; w `index.css` `--font-sans: "Geist Variable", …` i `--font-mono: "Geist Mono Variable", …`. Kolory: tokeny shadcn `neutral` (light + `.dark`) oraz dodatkowe z designu: `--success: #15803d; --success-muted: #f0fdf4; --warning: #b45309; --warning-muted: #fffbeb; --info: #1d4ed8; --info-muted: #eff6ff; --chart-1: #2563eb; --chart-2: #7c3aed` (dla `.dark` odpowiedniki jaśniejsze: `#4ade80`, `#fbbf24`, `#60a5fa`, tła `#0f2a1a`, `#2b2110`, `#111d33`). Vitest: `environment: "jsdom"`, `setupFiles: src/test/setup.ts` (`@testing-library/jest-dom`). Skrypty: `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`). Vite `server.proxy["/api"] = "http://127.0.0.1:8000"`.
- [ ] **Step 2: Test tras** w `src/App.test.tsx`:

```tsx
it.each([
  ["/", "Pulpit"], ["/zadania", "Twoje zadania"], ["/zadania/nowe", "Dodaj zadanie"],
  ["/zadania/5/edycja", "Edytuj zadanie"], ["/sesja", "Powtórka"],
  ["/statystyki", "Statystyki"], ["/ustawienia", "Ustawienia"],
])("trasa %s pokazuje ekran %s", (path, heading) => {
  renderAt(path)                                 // AppRoutes w MemoryRouter
  expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument()
})
```

- [ ] **Step 3:** `npm test` → FAIL; zaimplementuj `App.tsx` + strony; `npm test` → PASS.
- [ ] **Step 4:** `npm run build` → `frontend/dist/index.html` istnieje; `grep -r "fonts.googleapis\|cdn.jsdelivr\|unpkg" frontend/dist` → brak wyników.
- [ ] **Step 5: Commit** — `feat: szkielet frontendu React + shadcn/ui` (z `frontend/dist`)

### Task 5: Układ aplikacji — AppSidebar, SiteHeader, motyw

**Files:**
- Create: `frontend/src/components/AppSidebar.tsx`, `frontend/src/components/SiteHeader.tsx`, `frontend/src/components/AppLayout.tsx`, `frontend/src/theme.tsx`
- Create: `frontend/src/theme.test.tsx`, `frontend/src/components/AppSidebar.test.tsx`
- Modify: `frontend/src/App.tsx` (strony owinięte w `AppLayout`), `frontend/index.html` (skrypt inline w `<head>` ustawiający klasę `dark` przed renderem, żeby nie mignęło)

**Interfaces:**
- Produces: `type Theme = "light" | "dark" | "system"`; `ThemeProvider` + `useTheme(): { theme: Theme; resolved: "light" | "dark"; setTheme(t: Theme): void }` w `theme.tsx` (Ustawienia w Etapie 5 użyją `useTheme`).
- Produces: `SiteHeader` props `{ crumbs: string[]; status?: React.ReactNode }` — breadcrumb „LeetRepeat › …” + miejsce na „Zapisano lokalnie” / „Zmiany niezapisane”.
- Produces: `AppSidebar` props `{ taskCount?: number; streak?: number }` — licznik przy „Zadania” i karta „Małe kroki, codziennie” renderują się tylko gdy wartość podana (dane przyjdą w Etapach 2 i 4).

Wygląd 1:1 z artboardu `AppSidebar.dc.html`: logo + „LeetRepeat / Lokalna praktyka”, grupa „Nauka” (Pulpit, Zadania, Statystyki), grupa „Aplikacja” (Ustawienia), na dole karta serii, „Tylko na tym urządzeniu — Zadania i postępy zapisujesz lokalnie. Bez konta.” i przełącznik motywu (3 przyciski: słońce, księżyc, monitor; `role="radiogroup"`, `aria-label` „Motyw jasny/ciemny/systemowy”). Komponent shadcn `Sidebar` z `SidebarProvider`; `SidebarTrigger` w `SiteHeader`. Aktywny element według `useLocation()` (`/zadania/*` → Zadania; `/sesja` → Zadania).

- [ ] **Step 1: Testy:**

```tsx
// theme.test.tsx — matchMedia mockowany; localStorage czyszczony przed każdym testem
it("domyślnie systemowy: ciemny system → klasa dark", ...)     // expect(document.documentElement).toHaveClass("dark")
it("wybór 'light' zapisuje się i zdejmuje dark", ...)          // localStorage["leetrepeat-theme"] === "light"
it("zapisany 'dark' jest przywracany po ponownym renderze", ...)
it("tryb systemowy reaguje na zmianę motywu systemu", ...)      // Review Focus 4: wywołaj listener 'change' → klasa zmienia się
it("brak dostępu do localStorage nie wywraca aplikacji", ...)   // getItem/setItem rzucają → render bez błędu, motyw systemowy

// AppSidebar.test.tsx
it("zaznacza Zadania jako aktywne na /zadania/3/edycja", ...)  // link „Zadania” ma aria-current="page"
it("licznik zadań widoczny tylko gdy taskCount podany", ...)
it("klik w 'Motyw ciemny' ustawia klasę dark", ...)
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Zaimplementuj `theme.tsx` (stan + efekt nasłuchujący `matchMedia("(prefers-color-scheme: dark)")`, `try/catch` wokół `localStorage`), komponenty i `AppLayout` (`SidebarProvider` → `AppSidebar` + `SidebarInset` z `SiteHeader` i `<Outlet/>`).
- [ ] **Step 4:** `npm test` → PASS; `npm run build`.
- [ ] **Step 5: Commit** — `feat: panel boczny, nagłówek i motyw jasny/ciemny/systemowy` (z `frontend/dist`)

### Task 6: Klient API i baner braku połączenia

**Files:**
- Create: `frontend/src/api.ts`, `frontend/src/components/ConnectionBanner.tsx`, `frontend/src/api.test.ts`, `frontend/src/components/ConnectionBanner.test.tsx`
- Modify: `frontend/src/components/AppLayout.tsx` (baner nad treścią)

**Interfaces:**
- Consumes: `GET /api/health` (Task 3).
- Produces: `class ApiError extends Error { status: number }`; `async function request<T>(path: string, init?: RequestInit): Promise<T>` — prefiks `/api`, JSON in/out, nie-2xx → `ApiError(status, detail)`, błąd sieci → `ApiError(0, "Brak połączenia")`; `getHealth(): Promise<{ status: string; version: string }>`. Kolejne etapy dopisują tu swoje funkcje.
- Produces: `ConnectionBanner` — przy starcie woła `getHealth()`; przy `ApiError` z `status === 0` pokazuje `Alert` (wariant `destructive`): tytuł „Nie można połączyć się z aplikacją”, opis „Czy działa `python main.py`?”, przycisk „Spróbuj ponownie” (ponawia `getHealth()`).

- [ ] **Step 1: Testy** (`fetch` mockowany przez `vi.stubGlobal`):

```ts
it("request zwraca JSON przy 200", ...)
it("request rzuca ApiError(404, detail) przy 404", ...)
it("request rzuca ApiError(0) gdy fetch odrzuca", ...)
it("baner pojawia się, gdy health się nie udaje, i znika po 'Spróbuj ponownie' z sukcesem", ...)
it("baner nie pojawia się, gdy health zwraca ok", ...)
```

- [ ] **Step 2:** `npm test` → FAIL; zaimplementuj; `npm test` → PASS.
- [ ] **Step 3:** `npm run build`.
- [ ] **Step 4: Commit** — `feat: klient API i baner braku połączenia` (z `frontend/dist`)

### Task 7: Test całości (Playwright) i README

**Files:**
- Create: `frontend/e2e/smoke.spec.ts`, `frontend/playwright.config.ts`, `README.md`

**Interfaces:**
- Consumes: wszystko powyżej. Playwright `webServer`: `python main.py` z `LEETREPEAT_DB=<tmp>` w katalogu repo, `url: http://127.0.0.1:8000/api/health`.

- [ ] **Step 1: Test e2e:**

```ts
test("start, nawigacja, odświeżenie głębokiego linku i motyw", async ({ page }) => {
  await page.goto("http://127.0.0.1:8000/")
  await expect(page.getByRole("heading", { level: 1, name: "Pulpit" })).toBeVisible()
  await page.getByRole("link", { name: "Statystyki" }).click()
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Statystyki" })).toBeVisible()
  await page.getByRole("radio", { name: "Motyw ciemny" }).click()
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
  // żadnych żądań poza 127.0.0.1 (offline)
})
```
W teście zbierz `page.on("request")` i asercją sprawdź, że każdy URL zaczyna się od `http://127.0.0.1:8000`.

- [ ] **Step 2:** `npx playwright install chromium && npx playwright test` → PASS.
- [ ] **Step 3: README** po polsku: wymagania (Python 3.11+, .NET 10 SDK opcjonalnie), instalacja Parrot OS i Windows PowerShell (venv + `pip install -r requirements.txt`, .NET jak w README v2), uruchomienie `python main.py` → http://127.0.0.1:8000, `LEETREPEAT_DB`, „Zmiany we frontendzie: `cd frontend && npm install && npm run build`, commit z `dist`”, testy (`pytest`, `cd frontend && npm test`, `npx playwright test`), struktura repo ze spec §2.
- [ ] **Step 4:** pełna weryfikacja: `pytest` (passed / skipped tylko C# bez dotnet), `cd frontend && npm test && npm run build`, `git status` czysty po buildzie.
- [ ] **Step 5: Commit** — `docs: README i test e2e etapu 1`
