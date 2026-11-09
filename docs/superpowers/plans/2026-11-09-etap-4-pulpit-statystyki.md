# LeetRepeat v3 — Etap 4: Pulpit i Statystyki — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulpit pokazuje plan na dziś (albo „wszystko zrobione”), serię dni i postęp według języka; Statystyki pokazują rytm nauki za wybrany okres — wszystko na prawdziwych danych.

**Architecture:** SQL zliczający w `backend/repository/stats.py`, reguły (seria, skuteczność, słabe zadania, wypełnianie dni zerami) w `backend/services/stats.py`, endpointy `GET /api/dashboard` i `GET /api/stats` w `routes.py`. Frontend: `pages/Pulpit.tsx`, `pages/Statystyki.tsx` (wykres: shadcn `chart` na Recharts), `AppLayout` bierze licznik zadań i serię z `/api/dashboard`, polska odmiana liczebników w `lib/plural.ts`.

**Tech Stack:** jak w Etapie 3 + `recharts` (npm) i `components/ui/chart.tsx` z `/tmp/shadcn-src/ui/apps/v4/registry/new-york-v4/ui` (import `cn` → `@/lib/utils`, jak w Etapie 3).

**Spec:** `docs/superpowers/specs/2026-11-08-leetrepeat-v3-design.md` (§4 „Pojęcia wyliczane”, §5 `/dashboard`, `/stats`, §6 trasy `/` i `/statystyki`, „Wykresy”, §8). Wygląd: artboardy `Main` (plan na dziś), `Pulpit-gotowe`, `Statystyki` w `/home/claude/lr-canvas/project/*.dc.html`.

## Global Constraints

- Wszystko z Etapów 1–3: `127.0.0.1:8000`, offline, `frontend/dist` commitowany (`npm run build` przed commitem zmian frontendu), polskie teksty i komentarze, prosty liniowy kod, daty we frontendzie w czasie lokalnym (`lib/dates.ts`).
- Udana powtórka = ocena ≠ `again`. Skuteczność = udane / wszystkie oceny w okresie. Seria dni = liczba kolejnych dni z ≥ 1 oceną, licząc wstecz od dziś (gdy dziś brak ocen — od wczoraj). Najdłuższa seria = najdłuższy taki ciąg w całej historii.
- Dzień oceny = `reviewed_at[:10]` (zapisywane w czasie lokalnym serwera).
- Utrwalone / w nauce w „Postępie według języka” liczone po odstępie, niezależnie od terminu: utrwalone = ma oceny i `interval_days ≥ 21`, w nauce = ma oceny i `interval_days < 21` (w tym „Do powtórki”), nowe = brak ocen. Podpis pod kartą: „Utrwalone = odstęp co najmniej 21 dni.” (spec wygrywa z tekstem z designu o „3 udanych powtórkach”).
- Statystyki domyślnie: ostatnie 14 dni (`to` = dziś, `from` = dziś − 13), zakres włącznie z oboma końcami.
- Wykres: słupki Python / C# (`--chart-1` / `--chart-2` jak w designie: niebieski / fioletowy), shadcn `chart`.

## Review Focus

1. Pusta baza albo okres bez ocen → `/stats` zwraca `success_rate: null`, `avg_duration_s: null`, a ekran pokazuje „—”, a nie `NaN%`, `0%` ani błąd dzielenia przez zero. — Task 2 (API), Task 5 (ekran)
2. Złe parametry okresu (`from=abc`, `from > to`, zakres > 366 dni) → 422 z polskim komunikatem, nie 500; `/statystyki?dni=abc` we frontendzie → wraca do 14 dni. — Task 2, Task 5
3. Biblioteka z zadaniami tylko w jednym języku → wiersz drugiego języka „0 zadań” z pustym paskiem (szerokość 0, nie `NaN%`). — Task 4
4. Po zakończeniu sesji i „Wróć na Pulpit” seria w panelu bocznym i liczby na Pulpicie są świeże (pobrane ponownie), a nie z chwili pierwszego wejścia. — Task 3
5. Liczebniki po polsku dla 1, 2, 5, 12, 22: „1 zadanie / 2 zadania / 5 zadań / 12 zadań / 22 zadania”, „1 powtórka / 2 powtórki / 5 powtórek”, „1 dzień / 2 dni”. — Task 3

---

### Task 1: Seria dni, Pulpit — backend

**Files:**
- Create: `backend/repository/stats.py`, `backend/services/stats.py`
- Modify: `backend/api/routes.py`
- Test: `tests/test_stats_service.py`, `tests/test_api_stats.py`

**Interfaces:**
- Consumes: `scheduler.session_queue(con, today, language)` (Etap 3), `CONSOLIDATED_DAYS = 21` z `backend/services/tasks.py`.
- Produces (`backend/repository/stats.py`, sam SQL): `review_days(con) -> list[str]` (różne `substr(reviewed_at,1,10)`, rosnąco), `library_rows(con, language) -> list[sqlite3.Row]` (`language`, `reviewed` 0/1, `interval_days`, `due_date` dla każdego zadania), `completed_today(con, today: str) -> int` (różne `task_id` z oceną danego dnia), `upcoming_rows(con, today: str, language, limit: int) -> list[sqlite3.Row]` (zadania z ocenami i `due_date > today`, kolejność `due_date, id`; `id, title, language, difficulty, due_date`).
- Produces (`backend/services/stats.py`):
  - `streaks(days: list[str], today: date) -> tuple[int, int]` → `(seria, najdłuższa seria)`
  - `dashboard(con, today: date, language: str | None = None) -> dict` z kluczami spec §5: `due_count`, `due_by_language: {python, csharp}`, `new_count`, `streak`, `longest_streak`, `library_count`, `library_by_language: {python, csharp}`, `queue` (≤ 3 × `{id, title, language, difficulty, due_date}`), `queue_rest` (tytuły pozostałych), `session_count`, `progress_by_language` (zawsze 2 elementy, `python` potem `csharp`, `{language, consolidated, learning, new}`), `next_review_date` (`str | None`), `completed_today`.
  - `queue`: pierwsze 3 z `session_queue` (z ich `due_date`), `queue_rest`: tytuły pozostałych z kolejki sesji, `session_count` = długość kolejki sesji. Gdy kolejka sesji pusta → `queue` = 3 najbliższe z `upcoming_rows`, `queue_rest` = `[]`.
  - `next_review_date` = najmniejszy `due_date > dziś` wśród zadań z ocenami.
- HTTP: `GET /api/dashboard?language=` (`Literal["python","csharp"] | None`).

- [ ] **Step 1: Testy** w `tests/test_stats_service.py` (`TODAY = date(2026, 11, 9)`; oceny wstawiane `INSERT INTO reviews` z ręcznym `reviewed_at`, jak `add()` w `test_scheduler.py`):

```python
@pytest.mark.parametrize("days,expected", [
    ([], (0, 0)),
    (["2026-11-07", "2026-11-08", "2026-11-09"], (3, 3)),            # z dziś
    (["2026-11-07", "2026-11-08"], (2, 2)),                          # dziś brak ocen → od wczoraj
    (["2026-11-06", "2026-11-07"], (0, 2)),                          # przerwa wczoraj → 0
    (["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-11-09"], (1, 4)),
])
def test_streaks(days, expected): assert streaks(days, TODAY) == expected

def test_dashboard_empty(db)          # wszystkie liczby 0, queue == [], next_review_date None, progress 2 × zera
def test_dashboard_counts(db)         # 2 nowe Python, 1 do powtórki C#, 1 w nauce Python (due 11-12, interval 3), 1 utrwalone Python (interval 30, due 12-20):
                                      # due_count 1, due_by_language {"python": 0, "csharp": 1}, new_count 2, library_count 5,
                                      # library_by_language {"python": 4, "csharp": 1}, session_count 3, len(queue) 3, queue_rest == [],
                                      # progress python {consolidated 1, learning 1, new 2}, csharp {consolidated 0, learning 1, new 0},
                                      # next_review_date "2026-11-12"
def test_dashboard_queue_rest(db)     # 5 nowych → queue 3 elementy, queue_rest == tytuły 4. i 5.
def test_dashboard_done(db)           # jedno zadanie ocenione dziś (reviewed_at "2026-11-09T08:00:00"), due 11-12:
                                      # completed_today 1, due_count 0, session_count 0, queue == [to zadanie z due_date "2026-11-12"]
def test_dashboard_language(db)       # language="csharp" → library_count liczy tylko C#
```

oraz `tests/test_api_stats.py::test_dashboard_endpoint` (200, klucze z Interfaces) i `test_dashboard_bad_language` (`?language=java` → 422).

- [ ] **Step 2:** `.venv/bin/pytest tests/test_stats_service.py tests/test_api_stats.py -v` → FAIL (`ModuleNotFoundError`).
- [ ] **Step 3:** Zaimplementuj repozytorium, serwis i endpoint (wzorzec endpointów z Etapu 3).
- [ ] **Step 4:** `.venv/bin/pytest -q` → wszystkie PASS.
- [ ] **Step 5:** Commit `feat: seria dni i dane Pulpitu (GET /api/dashboard)`.

### Task 2: Statystyki — backend

**Files:**
- Modify: `backend/repository/stats.py`, `backend/services/stats.py`, `backend/api/routes.py`
- Test: `tests/test_stats_service.py`, `tests/test_api_stats.py`

**Interfaces:**
- Produces (`repository/stats.py`): `period_reviews(con, start: str, end: str) -> list[sqlite3.Row]` — oceny z dniem w `[start, end]` z kolumnami `task_id, title, language, rating, duration_seconds, day` (JOIN `tasks`).
- Produces (`services/stats.py`): `stats(con, start: date, end: date, today: date) -> dict`:
  - `reviews_count`, `by_language: {python, csharp}`
  - `success_rate: float | None` (0–1; `None` przy 0 ocen), `success_by_language: {python: {successful, total}, csharp: {...}}`
  - `avg_duration_s: float | None`, `avg_duration_by_language: {python: float | None, csharp: ...}`
  - `streak`, `longest_streak` (z całej historii, `streaks()` z Task 1)
  - `daily`: każdy dzień okresu, rosnąco, `{date, python, csharp}` (zera dla dni bez ocen)
  - `weak_tasks`: zadania z ≥ 3 ocenami w okresie i skutecznością < 1, rosnąco po skuteczności, potem malejąco po liczbie ocen, potem po tytule; max 4; `{id, title, language, successful, total}`
  - `recent_days`: ostatnie 4 dni okresu malejąco `{date, count, success_rate: float | None}`
- HTTP: `GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`; brak obu → ostatnie 14 dni; `from > to` → 422 „Początek okresu jest po jego końcu”; zakres > 366 dni → 422 „Okres może mieć najwyżej 366 dni”; zła data → 422 (Pydantic `date`).

- [ ] **Step 1: Testy:**

```python
def test_stats_empty(db)               # Review Focus 1: reviews_count 0, success_rate None, avg_duration_s None,
                                       # avg_duration_by_language {"python": None, "csharp": None}, len(daily) == 14 (zera), weak_tasks == [], recent_days[0] == {"date": "2026-11-09", "count": 0, "success_rate": None}
def test_stats_counts(db)              # 3 oceny Python (good 60 s, again 120 s, easy 30 s) + 1 C# (hard 90 s) w okresie, 1 ocena poza okresem:
                                       # reviews_count 4, by_language {"python": 3, "csharp": 1}, success_rate == 0.75,
                                       # success_by_language python {successful 2, total 3}, avg_duration_s == 75.0, avg python == 70.0
def test_stats_daily_fills_zeros(db)   # oceny 11-03 i 11-09 → daily[0]["date"] == "2026-10-27", wpis 11-03 {python: 1, csharp: 0}, dni bez ocen zerowe
def test_weak_tasks(db)                # A: 1/4 udanych, B: 2/3, C: 3/3 (pomijane, 100%), D: 0/2 (pomijane, < 3 oceny) → [A, B]
def test_weak_tasks_limit_4(db)        # 6 zadań po 3 oceny z różną skutecznością → 4 najsłabsze
```

w `test_api_stats.py` (Review Focus 2):

```python
def test_stats_default_14_days(client)     # len(daily) == 14, daily[-1]["date"] == date.today().isoformat()
def test_stats_custom_range(client)        # from=2026-11-01&to=2026-11-03 → 3 dni
def test_stats_bad_params(client)          # from=abc → 422; from=2026-11-05&to=2026-11-01 → 422 + "Początek okresu jest po jego końcu";
                                           # from=2025-01-01&to=2026-11-09 → 422 + "najwyżej 366 dni"
```

- [ ] **Step 2:** `.venv/bin/pytest tests/test_stats_service.py tests/test_api_stats.py -v` → nowe testy FAIL.
- [ ] **Step 3:** Zaimplementuj; endpoint przyjmuje `from_: date | None = Query(None, alias="from")`, `to: date | None = None`; podany tylko jeden koniec → drugi = ten sam koniec ± 13 dni.
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS.
- [ ] **Step 5:** Commit `feat: statystyki okresu (GET /api/stats)`.

### Task 3: Frontend — API, odmiana liczebników, świeży panel boczny

**Files:**
- Modify: `frontend/src/api.ts`, `frontend/src/components/AppLayout.tsx`, `frontend/src/components/AppSidebar.tsx:101-108`, `frontend/src/components/session/RatingPanel.tsx` (`tasksWord` → `plural`), `frontend/src/App.test.tsx`
- Create: `frontend/src/lib/plural.ts`
- Test: `frontend/src/lib/plural.test.ts`, `frontend/src/api.stats.test.ts`, `frontend/src/components/AppLayout.test.tsx`

**Interfaces:**
- Produces (`api.ts`): typy `Dashboard`, `DashboardQueueItem = { id; title; language; difficulty; due_date }`, `LanguageProgress = { language; consolidated; learning; new }`, `Stats`, `DailyCount = { date; python; csharp }`, `WeakTask = { id; title; language; successful; total }`, `RecentDay = { date; count; success_rate: number | null }` — pola dokładnie jak w Task 1–2; `getDashboard(): Promise<Dashboard>`, `getStats(from: string, to: string): Promise<Stats>` (`/stats?from=…&to=…`).
- Produces (`lib/plural.ts`): `plural(n: number, one: string, few: string, many: string): string` → `"<n> <forma>"`; forma `few` dla końcówek 2–4 poza 12–14, `one` tylko dla 1.
- `AppLayout`: zamiast `listTasks` → `getDashboard()` przy każdej zmianie `pathname`; przekazuje `taskCount = library_count`, `streak`. `AppSidebar`: karta serii „Twoja seria trwa już {plural(streak, "dzień", "dni", "dni")}.” i ukryta przy `streak === 0`.

- [ ] **Step 1: Testy:**

```ts
// plural.test.ts — Review Focus 5
it.each([[1, "1 zadanie"], [2, "2 zadania"], [5, "5 zadań"], [12, "12 zadań"], [22, "22 zadania"], [0, "0 zadań"]])(
  "%i", (n, text) => expect(plural(n, "zadanie", "zadania", "zadań")).toBe(text))
it("powtórki i dni", () => { expect(plural(3, "powtórka", "powtórki", "powtórek")).toBe("3 powtórki"); expect(plural(1, "dzień", "dni", "dni")).toBe("1 dzień") })
// api.stats.test.ts: getDashboard → "/api/dashboard"; getStats("2026-11-01", "2026-11-14") → "/api/stats?from=2026-11-01&to=2026-11-14"
// AppLayout.test.tsx — Review Focus 4:
it("seria i licznik odświeżają się po zmianie ekranu")   // stub /api/dashboard: 1. odpowiedź streak 2, library 5; renderApp("/zadania") → "Twoja seria trwa już 2 dni."
                                                         // zmiana odpowiedzi na streak 3, router.navigate("/") → "Twoja seria trwa już 3 dni.", wywołań /api/dashboard ≥ 2
it("seria 1 dzień i ukrycie przy 0")                     // streak 1 → "1 dzień."; streak 0 → brak tekstu "Twoja seria"
```

- [ ] **Step 2:** `cd frontend && npx vitest run src/lib/plural.test.ts src/api.stats.test.ts src/components/AppLayout.test.tsx` → FAIL.
- [ ] **Step 3:** Zaimplementuj; w `App.test.tsx` zamień atrapę `/api/tasks` z licznikiem 24 na `/api/dashboard` z `library_count: 24`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat: API Pulpitu i Statystyk, odmiana liczebników, świeża seria w panelu`.

### Task 4: Pulpit

**Files:**
- Modify: `frontend/src/pages/Pulpit.tsx` (zastępuje zaślepkę)
- Test: `frontend/src/pages/Pulpit.test.tsx`

**Interfaces:**
- Consumes: `getDashboard`, `plural`, `relativeDay`, `longDate`, `LANGUAGE_LABEL`, `DIFFICULTY_LABEL`.

Zachowanie (wygląd z artboardów `Main` i `Pulpit-gotowe`):
- Nagłówek: „Dobry dzień na trochę kodu.”, pod spodem „{Dzień tygodnia}, {longDate(dziś)} · Twoja codzienna praktyka” (dzień tygodnia po polsku, wielką literą); przycisk „Nowe zadanie” → `/zadania/nowe`.
- 4 karty: „Do powtórki dziś” (`due_count`, opis: „{python} Python · {csharp} C#”, a w stanie „wszystko zrobione” „{completed} z {completed + due} powtórek ukończonych”), „Nowe zadania” (`new_count`, „Czekają na pierwsze podejście”), „Seria dni” (`streak`, „Najdłuższa seria: {plural(longest, "dzień","dni","dni")}”), „Twoja biblioteka” (`library_count`, „{python} Python · {csharp} C#”).
- Karta główna — wariant wybierany w tej kolejności:
  1. `library_count === 0` → „Zacznij od pierwszego zadania” + przycisk „Dodaj zadanie” (`/zadania/nowe`).
  2. `completed_today > 0 && due_count === 0` → „Wszystko zrobione na dziś”, „Dobra robota — wszystkie zaplanowane powtórki są za Tobą.”, plakietka „{completed_today} ukończonych”, „Kolejne powtórki: {relativeDay(next).toLowerCase()}, {longDate(next, false)}” (gdy `next_review_date`), przycisk „Dodaj nowe zadanie”; gdy `new_count > 0` dodatkowo przycisk „Zacznij nowe zadania” (`/sesja`).
  3. `session_count > 0` → „{plural(session_count, "mały krok","małe kroki","małych kroków")}. Wiedza na dłużej.”, „Twoje zadania wracają wtedy, gdy warto je sobie przypomnieć.”, „Około {minuty} minut” (minuty = `ceil(session_count × 2,5 / 5) × 5`), „Najpierw: {queue[0].title} · {język}”, przycisk „Zacznij powtórkę” → `/sesja`.
  4. inaczej → „Na dziś nic do powtórki”, „Kolejne powtórki: …” jak w 2.
- „Postęp według języka”: „{plural(library, zadanie…)}” w rogu; dla Python i C#: „{plural(total, zadanie…)} · {consolidated} utrwalonych”, pasek trzysegmentowy (utrwalone / w nauce / nowe; szerokości `count / total × 100%`, przy `total === 0` pusty pasek), „{c} utrwalonych · {l} w nauce · {n} nowe”; podpis „Utrwalone = odstęp co najmniej 21 dni.”
- Lista: tytuł „Dziś w kolejce” + link „Zobacz wszystkie” (`/zadania`) albo w wariantach 2/4 „Następne w kolejce” + `longDate(next, false)`; wiersze `queue` (tytuł → `/sesja?zadanie={id}`, „Język · Trudność”, `relativeDay(due_date)`); gdy `queue_rest` niepuste: „+ {plural(n, "zadanie","zadania","zadań")}: {tytuły po przecinku}”. W wariancie 2 pod listą „Dziś możesz już odpocząć. Postęp został zapisany.”
- Stopka: „Regularność jest ważniejsza niż tempo. Po rozwiązaniu oceń, jak łatwo było Ci je odtworzyć.”
- Błąd wczytania → `Alert` „Nie udało się wczytać Pulpitu”.

- [ ] **Step 1: Testy** (`renderApp("/")`, atrapa `/api/dashboard`; obiekt bazowy `DASH` w pliku testu):

```tsx
it("plan na dziś")             // session_count 6, due 4, queue 3, queue_rest ["Binary Search", "Contains Duplicate", "Merge Intervals"]:
                               // "6 małych kroków. Wiedza na dłużej.", "Około 15 minut", "Najpierw: Two Sum · Python",
                               // link "Zacznij powtórkę" → "/sesja", link "Two Sum" → "/sesja?zadanie=1",
                               // "+ 3 zadania: Binary Search, Contains Duplicate, Merge Intervals"
it("wszystko zrobione")        // completed_today 6, due 0, session 0, next "2026-11-10" (fake timers: dziś 2026-11-09):
                               // "Wszystko zrobione na dziś", "6 z 6 powtórek ukończonych", "Kolejne powtórki: jutro, 10 listopada", "Następne w kolejce"
it("pusta biblioteka")         // library 0 → "Zacznij od pierwszego zadania", link "Dodaj zadanie"
it("nic do powtórki")          // completed 0, session 0, library 3 → "Na dziś nic do powtórki"
it("język bez zadań")          // Review Focus 3: progress csharp {0,0,0} → "0 zadań · 0 utrwalonych", żaden element z style width "NaN%"
it("nagłówek z datą")          // fake timers 2026-11-09 → "Poniedziałek, 9 listopada 2026 · Twoja codzienna praktyka"
```

- [ ] **Step 2:** `npx vitest run src/pages/Pulpit.test.tsx` → FAIL.
- [ ] **Step 3:** Zaimplementuj `Pulpit.tsx` (komponenty `Card`, `Badge`, `Button`, `Alert`).
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` bez błędów.
- [ ] **Step 5:** Commit `feat: Pulpit — plan na dziś i wszystko zrobione` (z `frontend/dist`).

### Task 5: Statystyki

**Files:**
- Modify: `frontend/src/pages/Statystyki.tsx`, `frontend/package.json` (`recharts`), `frontend/src/index.css` (jeśli brak `--chart-1`/`--chart-2` w obu motywach)
- Create: `frontend/src/components/ui/chart.tsx`
- Test: `frontend/src/pages/Statystyki.test.tsx`

**Interfaces:**
- Consumes: `getStats`, `plural`, `formatDuration`, `todayIso`, `parseLocalDate`, `longDate`.

Zachowanie (wygląd z artboardu `Statystyki`):
- Nagłówek „Zobacz, jak rośniesz.”, „Małe, regularne powtórki składają się na trwałą wiedzę.”; po prawej `Select` okresu: „Ostatnie 7 dni” / „Ostatnie 14 dni” / „Ostatnie 30 dni” / „Ostatnie 90 dni”, stan w URL `?dni=7|14|30|90` (inna wartość → 14); pod nim zakres „26 paź – 8 lis 2026”.
- 4 karty: „Wykonane powtórki” (`reviews_count`, „{py} Python · {cs} C#”), „Skuteczność” (`%` zaokrąglone; plakietka „Dobrze” ≥ 80%, „Średnio” 60–79%, „Słabo” < 60%; opis „{udane} z {wszystkie} bez ponownej nauki”), „Średni czas zadania” (`formatDuration(round(avg))`, „Python {m:ss} · C# {m:ss}”), „Seria dni” (`streak`, „Najdłuższa seria: …”). Brak danych → wartość „—”, bez plakietki (Review Focus 1).
- „Historia powtórek” — `ChartContainer` + `BarChart` z `daily`, dwie serie złożone (`stackId`) Python / C#, oś X: dzień miesiąca, legenda „Python · {suma}”, „C# · {suma}”, tooltip; podpis „liczba wykonanych powtórek dziennie”.
- „Skuteczność według języka”: dla każdego języka % i „{s} z {t} udanych” (przy `total 0` → „—” i „Brak ocen”), podpis „Udana powtórka = ocena Trudne, Dobre lub Łatwe. „Znowu” oznacza ponowną naukę.”
- „Zadania, które wymagają uwagi” — `weak_tasks`: tytuł (link `/sesja?zadanie={id}`), „Język · {s} z {t} udanych”, %, pasek (czerwony < 60%, pomarańczowy < 70%, inaczej `foreground`); pusto → „Brak zadań z niską skutecznością.”
- „Ostatnie dni” — `recent_days`: „{d MMM} · {dzisiaj | dzień tygodnia małą literą}”, `plural(count, "powtórka","powtórki","powtórek")`, `%` albo „—”.
- Stopka „Dane z tego urządzenia · Stan na {longDate(dziś)}, {HH:MM}”.
- Błąd → `Alert` „Nie udało się wczytać statystyk”.

- [ ] **Step 1: Testy** (`renderApp("/statystyki")`, atrapa `/api/stats`; fake timers z dniem 2026-11-09; Recharts w jsdom potrzebuje `ResizeObserver` — atrapa w `src/test/setup` albo w pliku):

```tsx
it("domyślnie 14 dni")                // wywołanie "/api/stats?from=2026-10-27&to=2026-11-09", tekst "27 paź – 9 lis 2026"
it("zmiana okresu w URL")             // renderApp("/statystyki?dni=30") → from=2026-10-11; renderApp("/statystyki?dni=abc") → from=2026-10-27 (Review Focus 2)
it("karty z danymi")                  // reviews 128 (84/44), success 0.86 (110/128) → "86%", "Dobrze", "110 z 128 bez ponownej nauki", avg 384 → "06:24"
it("brak ocen pokazuje kreski")       // Review Focus 1: reviews 0, success null, avg null → co najmniej 2 × "—", brak "NaN", brak "Dobrze"
it("słabe zadania i ostatnie dni")    // weak [{Group Anagrams, 4/8}] → "Group Anagrams", "50%", link "/sesja?zadanie=…"; recent [{2026-11-09, 10, 0.9}] → "9 lis · dzisiaj", "10 powtórek", "90%"
it("pusta lista słabych zadań")       // "Brak zadań z niską skutecznością."
```

- [ ] **Step 2:** `npx vitest run src/pages/Statystyki.test.tsx` → FAIL.
- [ ] **Step 3:** `npm install recharts`, skopiuj `chart.tsx`, zaimplementuj `Statystyki.tsx`.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` bez błędów.
- [ ] **Step 5:** Commit `feat: Statystyki — rytm nauki i wykres powtórek` (z `frontend/dist`).

### Task 6: Test całości i dokumentacja

**Files:**
- Modify: `frontend/e2e/sesja.spec.ts`, `README.md`, `frontend/dist`

- [ ] **Step 1:** W `sesja.spec.ts` (oba motywy) zacznij od Pulpitu, zgodnie ze spec §8: `page.goto("/")` → widoczne „1 mały krok. Wiedza na dłużej.” → klik „Zacznij powtórkę” → (dalej dotychczasowa sesja, ale z `/sesja`, nie `?zadanie=`) → po „Wróć na Pulpit” widoczne „Wszystko zrobione na dziś” i w panelu „Twoja seria trwa już 1 dzień.”; potem `/statystyki` → „Wykonane powtórki” z wartością „1”. Sprzątanie zadań bez zmian (oceny znikają z nimi przez `ON DELETE CASCADE`).
- [ ] **Step 2:** `PW_CHROME=/usr/bin/google-chrome PYTHON=.venv/bin/python npx playwright test` (w `frontend/`) → PASS; dodatkowo `--repeat-each=5` dla `sesja.spec.ts` → PASS.
- [ ] **Step 3:** README: krótka sekcja „Pulpit i Statystyki” (co liczy seria i skuteczność, `?dni=`).
- [ ] **Step 4:** Pełna weryfikacja: `.venv/bin/pytest -q`, `npx vitest run`, `npm run build`, Playwright → PASS; świeży klon (`git clone` do `/tmp`, link `node_modules`, `npx tsc -b`) kompiluje się.
- [ ] **Step 5:** Commit `test: e2e Pulpit → sesja → Pulpit, README`.
