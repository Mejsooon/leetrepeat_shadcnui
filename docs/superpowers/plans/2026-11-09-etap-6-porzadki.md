# LeetRepeat v3 — Etap 6: porządki — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamknąć wszystkie drobiazgi odłożone w przeglądach Etapów 1–5, tak żeby aplikacja nie miała znanych usterek.

**Architecture:** Bez nowych ekranów i endpointów. Zmiany punktowe w istniejących plikach, pogrupowane według miejsca w kodzie: błędy API po polsku, serwer i bezpieczeństwo, kopia zapasowa i środowisko, wyszukiwanie i import, potem frontend: biblioteka i formularze, sesja, Pulpit/Statystyki/Ustawienia.

**Tech Stack:** bez zmian (FastAPI + SQLite, React 19 + TS + shadcn/ui, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-08-leetrepeat-v3-design.md` (§5 „Błędy”, §6 „Obsługa błędów”, „Skróty”, „Notatki”).

## Już naprawione wcześniej (bez zadań)

| Drobiazg | Gdzie naprawiony |
|---|---|
| Runner domyślnie używał `sys.executable` zamiast wykrytego `python3`/`py` (Etap 1) | Etap 5 — `detect_python()` + Ustawienia |
| „Dzisiaj/Jutro” liczone w UTC (Etap 2) | Etap 3 — `lib/dates.ts` |
| Domyślna ocena nie zmienia się, gdy wynik testów przyjdzie później (Etap 3) | Etap 3 — „Przejdź do oceny” zablokowane w trakcie testów, więc wynik nie może przyjść później |

**Świadomie bez zmian:** anulowane pobieranie kopii nadal ustawia „ostatnia kopia” — serwer wysyła plik i nie wie, czy przeglądarka go zapisała. Po Tasku 2 nie da się tego wywołać z obcej strony.

## Global Constraints

- Wszystko z Etapów 1–5: `127.0.0.1:8000`, offline, `frontend/dist` commitowany (`npm run build` przed commitem zmian frontendu), polskie teksty, prosty liniowy kod, SQL tylko w `repository/`.
- Komunikaty błędów walidacji po polsku, bez przedrostka „Value error, ”; `detail` w odpowiedzi 422 to zawsze **tekst** (pierwszy błąd).
- Dozwolone źródła żądań zmieniających dane: host `127.0.0.1` albo `localhost` i port równy portowi serwera z nagłówka `Host` (domyślnie 80 bez portu) albo `5173` (serwer deweloperski Vite).
- Każdy drobiazg ma test, który najpierw pada.

## Review Focus

1. Zawężenie dozwolonych portów nie może zablokować zwykłego użycia: strona otwarta jako `http://localhost:8000` przy serwerze `127.0.0.1:8000` (Host `localhost:8000`) i serwer deweloperski `localhost:5173` → zapis działa. — Task 2
2. Polski handler błędów walidacji zmienia tylko 422 z walidacji; 404 „Nie znaleziono zadania”, 409 z przywracania i 403 z blokady obcych stron mają dotychczasowe `detail`. — Task 1
3. 404 dla brakujących plików (`/favicon.ico`) nie może zepsuć tras aplikacji ani istniejących plików: `/zadania/5/edycja`, `/statystyki?dni=30` → `index.html` 200; `/assets/…` i `/index.html` → 200. — Task 2
4. Ponowienie nieudanego zapisu notatki zadania A, które wystrzeli już po przejściu do zadania B, zapisuje tekst A do zadania A (nie do B) i nie wyświetla błędu na innym ekranie. — Task 6
5. Po przywróceniu bazy w trybie WAL i przełączeniu na `DELETE` dalsze zapisy działają, a obok bazy nie zostają pliki `-wal`/`-shm`. — Task 3

---

### Task 1: Błędy API po polsku i testy okresu statystyk

**Files:**
- Create: `backend/api/errors.py`
- Modify: `main.py` (rejestracja handlera w `create_app`)
- Test: `tests/test_api_errors.py`, `tests/test_api_stats.py`

**Interfaces:**
- Produces: `polish_message(error: dict) -> str` w `backend/api/errors.py` — mapowanie `error["type"]` (Pydantic v2) na tekst:
  - `value_error` → `msg` bez przedrostka `"Value error, "`
  - `int_parsing`, `int_type`, `int_from_float` → „Wpisz liczbę całkowitą”
  - `date_parsing`, `date_from_datetime_parsing`, `date_from_datetime_inexact`, `date_type` → „Nieprawidłowa data — użyj formatu RRRR-MM-DD”
  - `literal_error`, `enum` → „Niedozwolona wartość”
  - `missing` → „Brak wymaganego pola”
  - `string_too_long` → „Tekst jest za długi”
  - `too_short` → „Za mało elementów”, `too_long` → „Za dużo elementów”
  - `greater_than_equal`, `less_than_equal`, `greater_than`, `less_than` → „Wartość spoza dozwolonego zakresu”
  - `json_invalid` → „Nieprawidłowe dane (JSON)”
  - inne → „Nieprawidłowe dane”
- `create_app`: `@app.exception_handler(RequestValidationError)` → `JSONResponse({"detail": polish_message(exc.errors()[0])}, 422)`.

- [ ] **Step 1: Testy** `tests/test_api_errors.py`:

```python
def test_validation_message_without_prefix(client)   # PUT /api/settings python_timeout_s 0 → detail == "Limit musi być od 1 do 300 sekund"
def test_int_parsing(client)                         # python_timeout_s "abc" → detail == "Wpisz liczbę całkowitą"
def test_bad_dates(client)                           # /api/stats?from=abc i from=2026-02-30 → detail == "Nieprawidłowa data — użyj formatu RRRR-MM-DD"
def test_literal(client)                             # POST review rating "meh" → "Niedozwolona wartość"
def test_blank_title(client)                         # POST /api/tasks title "  " → detail == "Pole nie może być puste"
def test_other_errors_unchanged(client)              # Review Focus 2: GET /api/tasks/999 → detail "Nie znaleziono zadania";
                                                     # POST /api/backup/restore b"" → 409 "To nie jest plik bazy danych"; Origin evil → 403 "Żądanie z innej strony zostało zablokowane"
```

w `tests/test_api_stats.py`:

```python
def test_stats_only_from(client)   # from=2026-11-01 → 14 dni, daily[0] "2026-11-01", daily[-1] "2026-11-14"
def test_stats_only_to(client)     # to=2026-11-14 → daily[0] "2026-11-01"
```

- [ ] **Step 2:** `.venv/bin/pytest tests/test_api_errors.py tests/test_api_stats.py -v` → nowe testy z `test_api_errors.py` FAIL (lista w `detail`, przedrostek); testy `only_from/only_to` mogą przejść od razu (zachowanie istnieje, brakowało testów — zanotuj).
- [ ] **Step 3:** Zaimplementuj `errors.py` i handler.
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS (poprawić istniejące asercje, które sprawdzały `detail` jako listę, jeśli są).
- [ ] **Step 5:** Commit `fix: błędy walidacji API po polsku`.

### Task 2: Serwer i ochrona przed obcymi stronami

**Files:**
- Modify: `main.py` (`block_cross_site`, trasa frontendu), `backend/api/routes.py` (`download_backup`)
- Test: `tests/test_app.py`, `tests/test_backup.py`

**Interfaces:**
- `block_cross_site`: dla `POST/PUT/PATCH/DELETE` pod `/api/` oraz dodatkowo `GET /api/backup` — 403, gdy `Sec-Fetch-Site == "cross-site"` albo `Origin` istnieje i (host ∉ {`127.0.0.1`, `localhost`} albo port ∉ {port z `Host`, 5173}). Port domyślny przy braku: 80 (http).
- Trasa frontendu: `@app.api_route("/{path:path}", methods=["GET", "HEAD"])`; gdy ostatni segment ścieżki zawiera kropkę, a pliku w `dist` nie ma → `404` (zwykły tekst „Nie znaleziono”), zamiast `index.html`.
- `download_backup`: gdy `export_copy` rzuci wyjątek, plik tymczasowy jest usuwany przed ponownym rzuceniem.

- [ ] **Step 1: Testy** (klient testowy ma `Host: 127.0.0.1`, czyli port 80):

```python
def test_other_local_port_blocked(client)        # Origin "http://localhost:3000" i "http://127.0.0.1:3000" → 403 dla PUT /api/settings
def test_own_port_and_vite_allowed(client)       # Review Focus 1: Origin "http://127.0.0.1", "http://localhost" (port 80 = port z Host), "http://localhost:5173" → nie 403
def test_localhost_vs_ip_same_port(client)       # Review Focus 1: headers Host "127.0.0.1:8000" + Origin "http://localhost:8000" → nie 403 (TrustedHost przepuszcza)
def test_backup_download_cross_site(client)      # GET /api/backup z Sec-Fetch-Site "cross-site" → 403; GET /api/settings → last_backup_at nadal None
def test_head_request(client)                    # HEAD / → 200
def test_missing_static_file_404(client)         # GET /favicon.ico → 404; Review Focus 3: /zadania/5/edycja i /statystyki?dni=30 → 200 z index.html; /assets/app.js → 200
def test_backup_temp_removed_on_error(client, tmp_path, monkeypatch)
                                                 # monkeypatch tempfile.mkstemp w routes, by tworzył w tmp_path/"tmp"; export_copy rzuca OSError → odpowiedź 500 (raise_server_exceptions=False), katalog tmp pusty
```

Istniejący `test_same_origin_allowed` (Origin `http://127.0.0.1:8000` przy Host bez portu) zmień na przypadki z `test_own_port_and_vite_allowed`.

- [ ] **Step 2:** `.venv/bin/pytest tests/test_app.py tests/test_backup.py -v` → nowe FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS.
- [ ] **Step 5:** Commit `fix: ochrona przed innymi portami, GET /api/backup, HEAD i brakujące pliki`.

### Task 3: Kopia zapasowa i wykrywanie środowiska

**Files:**
- Modify: `backend/services/backup.py`, `backend/api/routes.py` (`restore_backup`), `backend/services/settings.py`, `main.py` (rozgrzanie wykrywania)
- Test: `tests/test_backup.py`, `tests/test_settings.py`

**Interfaces:**
- `restore`: plik tymczasowy przez `tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(db_path)), suffix=".przywracanie-tmp")`; po nadpisaniu bazy `PRAGMA journal_mode=DELETE`; po przywróceniu `last_backup_at` = wartość z bazy sprzed przywrócenia (przez `settings` repository, gdy była).
- `restore_backup` (route): gdy nagłówek `Content-Length` > `MAX_RESTORE_BYTES` → 413 przed odczytem ciała.
- `check_runtimes`: Python uznany za wykryty tylko, gdy wersja zaczyna się od „Python 3”.
- `create_app`: `threading.Thread(target=settings_service.detect_python, daemon=True).start()` — wykrywanie w tle przy starcie, żeby pierwsze `/api/run` nie czekało.

- [ ] **Step 1: Testy:**

```python
def test_restore_wal_file_switches_to_delete(client, tmp_path)   # Review Focus 5: kopia w trybie WAL (journal_mode=WAL, SCHEMA, 1 zadanie) → restore 200;
                                                                 # PRAGMA journal_mode na bazie == "delete"; POST /api/tasks działa; brak plików test.db-wal / test.db-shm
def test_restore_temp_names_unique(client, monkeypatch, tmp_path)  # owiń backup.validate, zapisując ścieżki: dwa restore → dwie różne ścieżki tymczasowe; po obu brak plików *.przywracanie-tmp
def test_last_backup_kept_after_restore(client)                  # download → last_backup_at X; restore tej kopii → last_backup_at nadal X
def test_runtimes_requires_python3(client)                       # python_path "/bin/echo" → runtimes.python.found False
def test_detect_python_warmed_on_start(monkeypatch, tmp_path)    # monkeypatch settings.detect_python licznikiem; create_app(...) → po join wątku licznik == 1
```

- [ ] **Step 2:** `.venv/bin/pytest tests/test_backup.py tests/test_settings.py -v` → nowe FAIL.
- [ ] **Step 3:** Zaimplementuj (sprawdzenie `Content-Length` pokrywa istniejący `test_restore_too_large`).
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS.
- [ ] **Step 5:** Commit `fix: przywracanie w trybie DELETE, unikalne pliki tymczasowe, wykrywanie Pythona w tle`.

### Task 4: Wyszukiwanie i import

**Files:**
- Modify: `backend/repository/tasks.py:96` (LIKE), `backend/repository/reviews.py` (komentarz do `ORDER BY` w `session_rows`), `scripts/import_seed.py`, `scripts/import_v2.py`
- Test: `tests/test_tasks_service.py`, `tests/test_import.py`

**Interfaces:**
- Wyszukiwanie: `q` z ucieczką `\` → `\\`, `%` → `\%`, `_` → `\_` i `LIKE ? ESCAPE '\'`.
- Import: każde zadanie przechodzi `TaskIn(**dane)` (Pydantic) przed `create_task`; błąd walidacji → zadanie pominięte, na wyjściu `Pominięto „{tytuł}”: {komunikat}`, liczone w „pominiętych”.

- [ ] **Step 1: Testy:**

```python
def test_search_percent_and_underscore_literal(db)   # zadania „100% pewne”, „1000 zadań”, „a_b”, „axb”: q="%" → ["100% pewne"]; q="a_b" → ["a_b"]
def test_import_seed_skips_invalid(tmp_path, db)     # JSON: 1 poprawne + 1 bez testów → (1, 1); w bazie 1 zadanie
def test_import_v2_skips_invalid(tmp_path, db)       # stara baza z wierszem o pustym tytule → pominięty, poprawny przeniesiony
```

- [ ] **Step 2:** `.venv/bin/pytest tests/test_tasks_service.py tests/test_import.py -v` → nowe FAIL.
- [ ] **Step 3:** Zaimplementuj; dopisz w `session_rows` komentarz, że `reviewed DESC` dzieli wyniki na dwie grupy, więc `CASE` porównuje daty tylko w obrębie jednej grupy.
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS.
- [ ] **Step 5:** Commit `fix: % i _ w wyszukiwarce, walidacja przy imporcie`.

### Task 5: Frontend — biblioteka, formularze, połączenie

**Files:**
- Modify: `frontend/src/api.ts` (`request`), `frontend/src/components/ConnectionBanner.tsx`, `frontend/src/pages/Zadania.tsx`, `frontend/src/pages/ZadanieForm.tsx`, `frontend/src/pages/Ustawienia.tsx`
- Test: `frontend/src/api.test.ts`, `frontend/src/components/ConnectionBanner.test.tsx`, `frontend/src/pages/Zadania.test.tsx`, `frontend/src/pages/ZadanieForm.test.tsx`, `frontend/src/pages/Ustawienia.test.tsx`

Zachowanie:
- `request`: gdy `detail` jest listą → komunikat = `detail[0].msg` (zapas na wypadek starego serwera).
- Baner: brak połączenia także przy statusie 502–504 z `/api/health` (serwer deweloperski Vite zwraca 502, gdy backend nie działa).
- Zadania: `?page=` niebędące dodatnią liczbą całkowitą → zapytanie z `page=1`.
- Formularz zadania: wiersze testów mają stabilne klucze (id w stanie formularza, niewysyłane do API) — komunikat błędu zostaje przy właściwym wierszu po usunięciu innego; błąd usuwania → `Alert` „Nie udało się usunąć zadania” + `detail`; `Escape` (i klik poza oknem) w oknie „Opuścić stronę?” = „Zostań” (`onOpenChange(false)` → `blocker.reset()`), tak samo w Ustawieniach.
- Ustawienia: ścieżka > 500 znaków → „Ścieżka może mieć najwyżej 500 znaków” pod polem, „Zapisz” nieaktywne.

- [ ] **Step 1: Testy:**

```ts
it("detail jako lista daje pierwszy komunikat")      // api.test.ts: 422 {detail: [{msg: "x"}]} → ApiError.message "x"
it("502 z serwera deweloperskiego pokazuje baner")    // ConnectionBanner: /api/health 502 → "Nie można połączyć się z aplikacją"
it("zła strona w adresie wraca do 1")                 // Zadania: renderApp("/zadania?page=abc") → wywołanie z "page=1", lista widoczna
it("błąd zostaje przy właściwym teście po usunięciu innego")  // ZadanieForm: 3 wiersze, wiersz 2 z pustym wywołaniem; usuń wiersz 1 →
                                                     // komunikat "Wywołanie funkcji nie może być puste" w wierszu, którego pole wejścia jest puste
it("błąd usuwania jest widoczny")                     // DELETE → 500 → "Nie udało się usunąć zadania"
it("Escape zostaje na formularzu")                    // zmiana tytułu, klik "Zadania" w panelu → dialog; Escape → brak dialogu, router.state.location.pathname bez zmian
it("Escape w Ustawieniach")                           // to samo dla /ustawienia
it("za długa ścieżka")                                // Ustawienia: 501 znaków → komunikat, "Zapisz" disabled
```

- [ ] **Step 2:** `cd frontend && npx vitest run` → nowe FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** `npx vitest run` → PASS; `npx tsc -b`.
- [ ] **Step 5:** Commit `fix: biblioteka i formularze — strona, klucze testów, błąd usuwania, Escape, baner` (z `frontend/dist`).

### Task 6: Frontend — sesja

**Files:**
- Modify: `frontend/src/api.ts` (`updateNotes`), `frontend/src/pages/Sesja.tsx`, `frontend/src/components/session/SolvePanel.tsx`
- Create: `frontend/src/lib/platform.ts`
- Test: `frontend/src/pages/Sesja.test.tsx`, `frontend/src/lib/platform.test.ts`

**Interfaces:**
- `updateNotes(id: number, notes: string, keepalive = false)` — `keepalive` przekazany do `fetch`.
- `lib/platform.ts`: `modKey(): "⌘" | "Ctrl"` — `"⌘"`, gdy `navigator.platform` albo `navigator.userAgent` zawiera `Mac`.

Zachowanie:
- Notatki: nieudany zapis zostawia tekst jako oczekujący, status „Nie udało się zapisać notatki — ponowię za chwilę” i ponowienie po 5 s (dla tego samego zadania, którego dotyczy tekst). Zdarzenie `pagehide` → natychmiastowy zapis z `keepalive: true`. Zapis przy wyjściu z ekranu (odmontowanie) nie zmienia statusu w nagłówku.
- Po zapisie oceny: zadanie czyszczone (`setTask(null)`) razem ze zmianą kolejki — przycisk „Zapisz ocenę…” znika od razu.
- Podpowiedź skrótu: `{modKey()} + Enter`.

- [ ] **Step 1: Testy:**

```tsx
it("nieudany zapis notatki jest ponawiany")         // fake timers: PATCH 500, potem 200; wpis → +1 s → status „…ponowię za chwilę” → +5 s → drugi PATCH z tym samym tekstem
it("ponowienie zapisuje do właściwego zadania")     // Review Focus 4: PATCH /api/tasks/1/notes 500; przejście do oceny i zapis → zadanie 2;
                                                    // +5 s → PATCH na /api/tasks/1/notes (nie /2) z tekstem zadania 1; status błędu nie zostaje
it("pagehide zapisuje notatkę z keepalive")         // wpis, window.dispatchEvent(new Event("pagehide")) → PATCH z init.keepalive === true
it("błąd przy wyjściu nie zostaje w nagłówku")      // PATCH 500; wpis; „Zakończ sesję” → na Pulpicie nagłówek „Zapisano lokalnie”, brak „Nie udało się zapisać notatki”
it("po zapisie oceny panel znika od razu")          // GET /api/tasks/2 wstrzymany; zapis oceny → brak przycisku „Zapisz ocenę i przejdź dalej” zanim zadanie 2 się wczyta
// platform.test.ts:
it("⌘ na Macu, Ctrl gdzie indziej")                 // vi.spyOn(navigator, "platform", "get") → "MacIntel" → "⌘"; "Win32" → "Ctrl"
```

- [ ] **Step 2:** `npx vitest run src/pages/Sesja.test.tsx src/lib/platform.test.ts` → FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `fix: sesja — ponawianie notatek, keepalive, ⌘ na Macu` (z `frontend/dist`).

### Task 7: Frontend — Pulpit, Statystyki, Ustawienia

**Files:**
- Modify: `frontend/src/api.ts` (`getDashboard`), `frontend/src/pages/Pulpit.tsx`, `frontend/src/pages/Statystyki.tsx`, `frontend/src/lib/dates.ts`, `frontend/src/pages/Ustawienia.tsx`
- Test: `frontend/src/api.stats.test.ts`, `frontend/src/pages/Pulpit.test.tsx`, `frontend/src/pages/Statystyki.test.tsx`, `frontend/src/lib/dates.test.ts`, `frontend/src/pages/Ustawienia.test.tsx`

**Interfaces:**
- `getDashboard()`: równoczesne wywołania dzielą jedno żądanie (moduł trzyma obietnicę w toku, czyszczoną po zakończeniu).
- `lib/dates.ts`: `chartDayLabel(iso: string, longPeriod: boolean): string` — `longPeriod` → `shortDate(iso)` („9 lis”), inaczej sam dzień („9”).

Zachowanie:
- Pulpit: nagłówek listy „Dziś w kolejce” + „Zobacz wszystkie”, gdy `session_count > 0` (także w wariancie „wszystko zrobione” z nowymi zadaniami); inaczej „Następne w kolejce” + data.
- Statystyki: odpowiedź dla starego okresu ignorowana (flaga w sprzątaniu efektu); oś X: `chartDayLabel(date, days > 31)`; tytuł podpowiedzi wykresu: `longDate(date, false)`.
- Ustawienia: po „Pobierz kopię” odświeżanie `getSettings` co 1 s, najwyżej 10 razy, aż zmieni się `last_backup_at`.

- [ ] **Step 1: Testy:**

```ts
it("równoczesne getDashboard to jedno żądanie")      // dwa wywołania naraz → 1 fetch, oba dostają te same dane; kolejne wywołanie po zakończeniu → nowy fetch
it("zrobione, ale są nowe → Dziś w kolejce")         // Pulpit: completed 2, due 0, session 3 → "Dziś w kolejce", brak "Następne w kolejce"
it("stara odpowiedź nie nadpisuje nowego okresu")    // Statystyki: /api/stats dla 14 dni wstrzymane, zmiana na 30 dni (renderApp z router.navigate), odpowiedź 30 dni (reviews 5) przychodzi pierwsza,
                                                     // potem 14 dni (reviews 9) → widoczne "5", nie "9"
it("chartDayLabel")                                  // ("2026-11-09", false) → "9"; ("2026-11-09", true) → "9 lis"
it("ostatnia kopia odświeża się po pobraniu")        // fake timers; 1. i 2. getSettings: last_backup_at null, 3.: "2026-11-09T22:00:00" → po kliknięciu i 3 s widać "9 listopada 2026, 22:00"; potem brak dalszych wywołań
```

- [ ] **Step 2:** `npx vitest run` → nowe FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build`.
- [ ] **Step 5:** Commit `fix: Pulpit, Statystyki i Ustawienia — nagłówek kolejki, wyścig okresów, etykiety wykresu, odświeżanie kopii` (z `frontend/dist`).

### Task 8: Weryfikacja całości

**Files:**
- Modify: `frontend/dist`, `README.md` (tylko gdy coś z powyższego zmienia opis — np. dozwolone porty: „strona z innego portu niż 8000/5173 nie może zmieniać danych”)

- [ ] **Step 1:** `PW_CHROME=/usr/bin/google-chrome PYTHON=$(pwd)/../.venv/bin/python npx playwright test` (w `frontend/`) → 5 PASS; `sesja.spec.ts --repeat-each=5` → PASS.
- [ ] **Step 2:** `.venv/bin/pytest -q`, `npx vitest run`, `npx tsc -b`, `npm run build` → PASS.
- [ ] **Step 3:** Świeży klon (`git clone` do `/tmp`, link `node_modules`, `npx tsc -b`) → kompiluje się.
- [ ] **Step 4:** README zaktualizowane, jeśli potrzeba.
- [ ] **Step 5:** Commit `chore: weryfikacja porządków, README` (jeśli są zmiany).
