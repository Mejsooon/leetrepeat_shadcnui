# LeetRepeat v3 — Etap 5: Ustawienia — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekran Ustawienia pozwala wybrać motyw, sprawdzić i ustawić ścieżki oraz limity czasu Pythona i .NET (używane przez `/api/run`), pobrać kopię bazy i przywrócić ją z pliku; brak środowiska jest widoczny przy zadaniach.

**Architecture:** Backend: `repository/settings.py` (SQL tabeli `settings`), `services/settings.py` (domyślne wartości, wykrywanie Pythona, sprawdzanie runtime’ów, opcje dla runnera), `services/backup.py` (kopia przez `sqlite3` backup API, walidacja i przywracanie), endpointy w `routes.py`. Frontend: `pages/Ustawienia.tsx` (motyw, środowisko, kopia zapasowa), plakietka „Niedostępne” w `pages/Zadania.tsx`.

**Tech Stack:** jak w Etapie 4. Bez nowych zależności — przywracanie wysyła plik jako surowe ciało żądania (`application/octet-stream`), bez `python-multipart`.

**Spec:** `docs/superpowers/specs/2026-11-08-leetrepeat-v3-design.md` (§2 „Ustawienia”, §3 `settings`, §5 `/settings`, `/settings/runtimes`, `/backup`, `/backup/restore`, §6 „Motyw”, „Obsługa błędów”). Wygląd: artboard `Ustawienia` w `/home/claude/lr-canvas/project/Ustawienia.dc.html`.

## Global Constraints

- Wszystko z Etapów 1–4: `127.0.0.1:8000`, offline, `frontend/dist` commitowany, polskie teksty, prosty liniowy kod, SQL tylko w `repository/`, ochrona `block_cross_site` dla `POST/PUT/PATCH/DELETE` pod `/api`.
- Klucze `settings` (spec §3): `python_path` (domyślnie wykryty `python3`/`py`), `dotnet_path` (domyślnie `dotnet`), `python_timeout_s` (5), `csharp_timeout_s` (20). Wartości w bazie jako TEXT. Motyw trzyma przeglądarka (`localStorage`, `leetrepeat-theme`) — bez zmian.
- Wykrywanie Pythona: pierwszy z kandydatów `python3`, `py`, `python`, `sys.executable`, który istnieje (`shutil.which`) i na `--version` odpowiada tekstem zaczynającym się od `Python 3` w ≤ 5 s; brak → `sys.executable`. Wynik zapamiętany na czas działania serwera (`functools.cache`).
- Limity: liczba całkowita 1–300 s dla obu języków. Ścieżki: niepuste, ≤ 500 znaków, przycięte z białych znaków. Błędy walidacji po polsku: „Pole nie może być puste”, „Limit musi być od 1 do 300 sekund”.
- Kopia: nazwa pliku `leetrepeat-RRRR-MM-DD.db`. Przywrócenie: najpierw walidacja (plik SQLite, `PRAGMA integrity_check` = `ok`, tabele `tasks`, `tests`, `reviews`, `tags`, `task_tags`, `settings` z wszystkimi kolumnami ze `SCHEMA`), dopiero potem kopia obecnej bazy obok (`<baza>.przed-przywroceniem-RRRRMMDD-GGMMSS.db`, przy kolizji nazwy dopisek `-2`, `-3`…) i nadpisanie przez `src.backup(dst)`. Zły plik → 409, obecne dane nietknięte, żadnej kopii obok.
- Copy z designu: „Wygląd, kopia zapasowa i środowisko do uruchamiania testów.”, motywy „Jasny / Zawsze jasne tło.”, „Ciemny / Zawsze ciemne tło.”, „Systemowy / Jak w ustawieniach systemu.”, „Pierwsza kompilacja C# trwa kilka sekund — dlatego limit jest wyższy niż dla Pythona.”, „Motyw zmienia się od razu. Ścieżki i limity zapisują się po kliknięciu „Zapisz”.”

## Review Focus

1. Przywracanie z pliku, który nie jest bazą LeetRepeat (zdjęcie, pusty plik, ucięta baza, baza innej aplikacji) → 409 z polskim komunikatem; zadania przed i po są te same; nie powstaje plik kopii obok. — Task 2
2. Obca strona wysyła `PUT /api/settings` z `python_path` = dowolny program (wtedy `/api/run` uruchomiłby go z kodem napastnika) → 403, ustawienia bez zmian. To samo dla `POST /api/backup/restore`. — Task 1, Task 2
3. Limit `0`, `-1`, `abc`, `100000`, pusta ścieżka → 422 po polsku; w formularzu komunikat pod polem i nieaktywne „Zapisz”. — Task 1, Task 3
4. Ścieżka do programu, który nie istnieje albo nie odpowiada na `--version` (np. `/bin/false`) → `runtimes` daje `found: false`, `/api/run` zwraca 503 z nazwą ścieżki, aplikacja działa dalej. — Task 1
5. Dwa przywrócenia w tej samej sekundzie → dwa różne pliki kopii obok (druga nie nadpisuje pierwszej). — Task 2

---

### Task 1: Ustawienia i runtime’y — backend

**Files:**
- Create: `backend/repository/settings.py`, `backend/services/settings.py`
- Modify: `backend/api/schemas.py`, `backend/api/routes.py` (`/run` bierze ustawienia)
- Test: `tests/test_settings.py`

**Interfaces:**
- Produces (`repository/settings.py`): `get_all(con) -> dict[str, str]`, `set_many(con, values: dict[str, str]) -> None` (`INSERT … ON CONFLICT(key) DO UPDATE`).
- Produces (`services/settings.py`):
  - `detect_python() -> str` (reguła z Global Constraints, `@functools.cache`)
  - `defaults() -> dict` → `{"python_path": detect_python(), "dotnet_path": "dotnet", "python_timeout_s": 5, "csharp_timeout_s": 20}`
  - `get_settings(con) -> dict` → `{"values": {…4 klucze, liczby jako int}, "defaults": defaults()}` (brak w bazie → domyślne)
  - `save_settings(con, values: dict) -> dict` → zapisuje 4 klucze, zwraca jak `get_settings`
  - `runner_options(con, language: str) -> dict` → `{"python_path": …, "dotnet_path": …, "timeout_s": …}` dla `run_tests(**opts)`
  - `check_runtimes(con) -> dict` → `{"python": {"found", "version", "path"}, "dotnet": {…}}`; `version`: pierwsza linia wyjścia `--version` (Python: „Python 3.12.3”, dotnet: „10.0.100”), `path`: wynik `shutil.which` albo podana ścieżka; nie znaleziono / błąd / timeout 10 s → `{"found": False, "version": None, "path": <podana ścieżka>}`
- Schemat `SettingsIn {python_path: str, dotnet_path: str, python_timeout_s: int, csharp_timeout_s: int}` z walidatorami z Global Constraints.
- HTTP: `GET /api/settings`, `PUT /api/settings` (→ jak GET), `GET /api/settings/runtimes`. `/api/run` woła `run_tests(..., **settings.runner_options(con, body.language))`.

- [ ] **Step 1: Testy** w `tests/test_settings.py` (fixture `db`, `client`, `monkeypatch`):

```python
def test_defaults_when_empty(db)                 # get_settings(db)["values"] == {"python_path": detect_python(), "dotnet_path": "dotnet", "python_timeout_s": 5, "csharp_timeout_s": 20}
def test_detect_python_skips_broken(monkeypatch) # detect_python.cache_clear(); which: python3 → None, py → "/x/py"; subprocess „Python 3.11.2” → "/x/py"
def test_save_and_read(db)                       # save_settings(..., python_timeout_s 7) → get_settings: 7; runner_options(db, "python")["timeout_s"] == 7, runner_options(db, "csharp")["timeout_s"] == 20
def test_api_get_put(client)                     # PUT {python_path: " /usr/bin/python3 ", ..., csharp_timeout_s: 30} → 200, values.python_path == "/usr/bin/python3", csharp 30
def test_api_validation(client)                  # Review Focus 3: timeout 0, -1, 301, "abc" → 422 i "Limit musi być od 1 do 300 sekund" (dla liczb); python_path "  " → 422 "Pole nie może być puste"
def test_runtimes_missing_program(client)        # Review Focus 4: PUT python_path "/nie/ma/takiego", dotnet_path "/bin/false" → runtimes: python found False, path "/nie/ma/takiego"; dotnet found False
def test_runtimes_found_python(client)           # domyślne → python found True, version startswith "Python 3"
def test_run_uses_settings(client)               # Review Focus 4: PUT python_path "/nie/ma/takiego" → POST /api/run (Python) → 503, "/nie/ma/takiego" w detail
def test_run_uses_timeout(client, monkeypatch)   # podmień routes.run_tests na rejestrujący kwargs; PUT python_timeout_s 9 → /run → kwargs["timeout_s"] == 9
def test_cross_site_put_blocked(client)          # Review Focus 2: PUT z Origin "http://evil.example" → 403; GET /api/settings → python_path bez zmian
```

- [ ] **Step 2:** `.venv/bin/pytest tests/test_settings.py -v` → FAIL (`ModuleNotFoundError`).
- [ ] **Step 3:** Zaimplementuj (subprocess: `subprocess.run([path, "--version"], capture_output=True, text=True, timeout=…)`, łapany `OSError`/`TimeoutExpired`; dotnet pisze wersję na stdout, stary Python na stderr — bierz stdout, a gdy pusty, stderr).
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS.
- [ ] **Step 5:** Commit `feat: ustawienia ścieżek i limitów, sprawdzanie Pythona i .NET`.

### Task 2: Kopia zapasowa — backend

**Files:**
- Create: `backend/services/backup.py`
- Modify: `backend/repository/settings.py` (bez zmian w API — `last_backup_at` to zwykły klucz), `backend/services/settings.py` (`get_settings` dokłada `database`), `backend/api/routes.py`
- Test: `tests/test_backup.py`

**Interfaces:**
- Produces (`services/backup.py`):
  - `export_copy(db_path: str, dest_path: str) -> None` — spójna kopia przez `sqlite3.Connection.backup`
  - `validate(path: str) -> str | None` — `None` = OK, inaczej komunikat: „To nie jest plik bazy danych”, „Plik bazy jest uszkodzony”, „To nie jest baza LeetRepeat (brak tabeli {nazwa})”, „To nie jest baza LeetRepeat (brak kolumny {tabela}.{kolumna})”
  - `restore(db_path: str, data: bytes, now: datetime) -> dict` → `{"tasks": int, "backup_path": str}`; `ValueError(komunikat)` przy złym pliku (przed jakąkolwiek zmianą)
- `get_settings(con, db_path)` dokłada `"database": {"path": db_path (absolutna), "task_count": int, "last_backup_at": str | None}` (Ruling: sygnatura dostaje `db_path`; wywołania z Task 1 zaktualizować).
- HTTP: `GET /api/backup` → `FileResponse` z `Content-Disposition: attachment; filename="leetrepeat-RRRR-MM-DD.db"`, zapisuje `last_backup_at` (ISO, sekundy); plik tymczasowy usuwany po wysłaniu (`BackgroundTask`). `POST /api/backup/restore` — ciało = bajty pliku; > 200 MB → 413 „Plik jest za duży”; zły plik → 409 `detail`; OK → 200 `{tasks, backup_path}`.

- [ ] **Step 1: Testy** w `tests/test_backup.py` (`client` + ścieżka bazy z fixture; zadanie dodane przez API):

```python
def test_download_backup(client, tmp_path)       # 200, content zaczyna się od b"SQLite format 3\x00", nagłówek zawiera f'leetrepeat-{date.today()}.db';
                                                 # zapisany do tmp i otwarty sqlite3: 1 zadanie; GET /api/settings → database.last_backup_at nie None
def test_restore_roundtrip(client)               # pobierz kopię (1 zadanie), dodaj 2. zadanie, POST restore z kopią → 200 {tasks: 1}; GET /api/tasks → total 1;
                                                 # plik backup_path istnieje i ma 2 zadania
@pytest.mark.parametrize("data,message", [
    (b"", "To nie jest plik bazy danych"), (b"\x89PNG\r\n\x1a\n" + b"0" * 100, "To nie jest plik bazy danych"),
    (<baza SQLite z tabelą foo>, "brak tabeli tasks"), (<pierwsze 4096 bajtów prawdziwej kopii>, "uszkodzony")])
def test_restore_rejects_bad_file(client, data, message)   # Review Focus 1: 409, message w detail, GET /api/tasks total bez zmian, brak plików *.przed-przywroceniem-* obok bazy
def test_restore_missing_column(client)          # baza z tabelami jak SCHEMA, ale bez tasks.notes → 409 "brak kolumny tasks.notes"
def test_two_restores_two_backups(client)        # Review Focus 5: freeze `now` (monkeypatch datetime w routes albo parametr) → dwa restore → dwa różne backup_path, oba istnieją
def test_restore_cross_site_blocked(client)      # Review Focus 2: Origin evil → 403, dane bez zmian
def test_restore_too_large(client, monkeypatch)  # monkeypatch MAX_RESTORE_BYTES = 10 → 413 "Plik jest za duży"
def test_settings_database_info(client)          # database.task_count == liczba zadań, path kończy się nazwą pliku bazy, last_backup_at None na starcie
```

- [ ] **Step 2:** `.venv/bin/pytest tests/test_backup.py -v` → FAIL.
- [ ] **Step 3:** Zaimplementuj. Plik przesłany zapisz do pliku tymczasowego obok bazy, `validate`, potem kopia obecnej i `src.backup(dst)`; plik tymczasowy usuwany w `finally`. `MAX_RESTORE_BYTES = 200 * 1024 * 1024` w `services/backup.py`.
- [ ] **Step 4:** `.venv/bin/pytest -q` → PASS.
- [ ] **Step 5:** Commit `feat: kopia zapasowa bazy i przywracanie z pliku`.

### Task 3: Ekran Ustawienia — wygląd i środowisko

**Files:**
- Modify: `frontend/src/api.ts`, `frontend/src/pages/Ustawienia.tsx` (zastępuje zaślepkę)
- Test: `frontend/src/pages/Ustawienia.test.tsx`

**Interfaces:**
- Produces (`api.ts`): `type SettingsValues = { python_path: string; dotnet_path: string; python_timeout_s: number; csharp_timeout_s: number }`, `type SettingsResponse = { values: SettingsValues; defaults: SettingsValues; database: { path: string; task_count: number; last_backup_at: string | null } }`, `type RuntimeInfo = { found: boolean; version: string | null; path: string }`, `type Runtimes = { python: RuntimeInfo; dotnet: RuntimeInfo }`; `getSettings()`, `saveSettings(values: SettingsValues): Promise<SettingsResponse>`, `getRuntimes(): Promise<Runtimes>`, `restoreBackup(file: Blob): Promise<{ tasks: number; backup_path: string }>` (`POST /backup/restore`, `Content-Type: application/octet-stream`, `body: file`), `BACKUP_URL = "/api/backup"`.

Zachowanie (wygląd z artboardu `Ustawienia`):
- Nagłówek „Ustawienia”, „Wygląd, kopia zapasowa i środowisko do uruchamiania testów.”
- Karta „Wygląd”: 3 karty-radio (Jasny / Ciemny / Systemowy z opisami z Global Constraints), `RadioGroup` podpięte do `useTheme()`; „Wybór motywu zapisuje się w tej przeglądarce.”
- Karta „Środowisko uruchomieniowe”, przycisk „Sprawdź ponownie” (ponowne `getRuntimes`). Dla Python i „C# (.NET)”: plakietka „Wykryto” + wersja („Python 3.12.3” / „.NET SDK 10.0.100”) albo „Nie wykryto” + „Zadania w tym języku są niedostępne. Zainstaluj Pythona 3.12+ / .NET 10 SDK albo popraw ścieżkę (instrukcja w README).”; pole „Ścieżka do programu”, pole liczbowe „Limit czasu na uruchomienie” + „sekund”; pod C# zdanie o pierwszej kompilacji.
- Walidacja na żywo (jak w backendzie): komunikat pod polem, „Zapisz” nieaktywne przy błędzie albo gdy nic się nie zmieniło. „Przywróć domyślne” wpisuje `defaults` do formularza (bez zapisu). Zapis → `saveSettings`, potem `getRuntimes`; błąd → `Alert` z `detail`.
- Niezapisane zmiany → status nagłówka „Zmiany niezapisane” i potwierdzenie przy wyjściu (`useBlocker` + `beforeunload`, wzorzec z `ZadanieForm.tsx`).
- Stopka: „Motyw zmienia się od razu. Ścieżki i limity zapisują się po kliknięciu „Zapisz”.”

- [ ] **Step 1: Testy** (`renderApp("/ustawienia")`, atrapy `/api/settings`, `/api/settings/runtimes`; własny `fetch` rejestrujący `PUT`):

```tsx
it("motyw zmienia się od razu")              // klik radio "Ciemny" → document.documentElement ma klasę "dark", localStorage "leetrepeat-theme" == "dark"
it("pokazuje wykryte środowisko")            // python found → "Wykryto", "Python 3.12.3"; dotnet found false → "Nie wykryto", tekst o niedostępnych zadaniach
it("zapis ścieżki i limitu")                 // zmiana limitu Pythona na 7 → "Zmiany niezapisane" w nagłówku → "Zapisz" → PUT body {…, python_timeout_s: 7}; po zapisie status wraca do "Zapisano lokalnie"
it("walidacja limitu i ścieżki")             // Review Focus 3: limit "0" → "Limit musi być od 1 do 300 sekund", "Zapisz" disabled; ścieżka "" → "Pole nie może być puste"
it("przywróć domyślne")                      // values timeout 9, defaults 5 → klik → pole ma 5, "Zapisz" aktywne, PUT nie wysłany
it("sprawdź ponownie")                       // klik → drugie wywołanie /api/settings/runtimes
it("zapis bez zmian jest nieaktywny")        // po wczytaniu "Zapisz" disabled
```

- [ ] **Step 2:** `cd frontend && npx vitest run src/pages/Ustawienia.test.tsx` → FAIL.
- [ ] **Step 3:** Zaimplementuj (w `App.test.tsx` dodaj atrapy `/api/settings` i `/api/settings/runtimes` dla trasy `/ustawienia`; testy panelu bocznego, które używały `/ustawienia` jako „ekranu bez danych”, przełącz na `/zadania/nowe`).
- [ ] **Step 4:** `npx vitest run` → PASS; `npx tsc -b` bez błędów.
- [ ] **Step 5:** Commit `feat: Ustawienia — motyw, ścieżki i limity Pythona i .NET`.

### Task 4: Ekran Ustawienia — kopia zapasowa

**Files:**
- Modify: `frontend/src/pages/Ustawienia.tsx`
- Test: `frontend/src/pages/Ustawienia.test.tsx`

**Interfaces:**
- Consumes: `restoreBackup`, `BACKUP_URL`, `SettingsResponse.database`, `plural`, `longDate`.

Zachowanie:
- Karta „Kopia zapasowa”: „Wszystkie zadania, testy i historia ocen są w jednym pliku bazy.”, ścieżka bazy w `<code>`, „{plural(task_count, zadanie…)} · ostatnia kopia: {nigdy | longDate(dzień) + GG:MM}”.
- „Eksportuj bazę”: „Pobierz kopię pliku, np. leetrepeat-{todayIso()}.db.” + przycisk-link „Pobierz kopię” (`<a href={BACKUP_URL} download>`); po kliknięciu po 1 s ponowne `getSettings()` (odświeża „ostatnia kopia”).
- „Przywróć z kopii”: „Wybierz wcześniej pobrany plik .db.”, przycisk „Wybierz plik…” otwiera ukryty `<input type="file" accept=".db">`; po wyborze `AlertDialog` „Przywrócić bazę z pliku {nazwa}?” z treścią „Przywrócenie zastępuje obecną bazę. Przed zastąpieniem aplikacja sama zapisze kopię obecnego pliku obok niego.” i przyciskami „Anuluj” / „Przywróć”. Sukces → `Alert` „Przywrócono bazę: {plural(tasks, zadanie…)}. Poprzednia baza: {backup_path}” + odświeżenie `getSettings`; błąd → `Alert variant="destructive"` „Nie udało się przywrócić bazy” + `detail` + „Obecne dane są nietknięte.”. Pole pliku czyszczone po każdej próbie (ten sam plik można wybrać ponownie).

- [ ] **Step 1: Testy:**

```tsx
it("informacje o bazie")            // database {path "/home/m/leetrepeat/leetrepeat.db", task_count 24, last_backup_at null} → ścieżka, "24 zadania · ostatnia kopia: nigdy"; link "Pobierz kopię" href "/api/backup"
it("przywracanie z potwierdzeniem") // userEvent.upload(input, new File(["x"], "kopia.db")) → dialog "Przywrócić bazę z pliku kopia.db?"; "Przywróć" → POST /api/backup/restore z Content-Type application/octet-stream; "Przywrócono bazę: 3 zadania."
it("anulowanie nie wysyła pliku")   // "Anuluj" → brak POST
it("zły plik pokazuje błąd")        // 409 {detail: "To nie jest plik bazy danych"} → "Nie udało się przywrócić bazy", detail, "Obecne dane są nietknięte."
```

- [ ] **Step 2:** `npx vitest run src/pages/Ustawienia.test.tsx` → nowe testy FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat: Ustawienia — kopia zapasowa i przywracanie` (z `frontend/dist`).

### Task 5: „Niedostępne” przy zadaniach

**Files:**
- Modify: `frontend/src/pages/Zadania.tsx` (kolumna języka)
- Test: `frontend/src/pages/Zadania.test.tsx`

**Interfaces:**
- Consumes: `getRuntimes()`.

Zachowanie: Zadania wołają `getRuntimes()` raz przy wejściu; gdy runtime języka zadania ma `found: false`, obok plakietki języka plakietka `destructive`-outline „Niedostępne” z `title` „Nie wykryto {Pythona | .NET} — sprawdź Ustawienia” i linkiem do `/ustawienia`. Błąd `getRuntimes` → brak plakietek (nie blokuje biblioteki).

- [ ] **Step 1: Testy:**

```tsx
it("plakietka Niedostępne przy zadaniach C# bez .NET")   // runtimes dotnet found false, python found true; wiersz C# ma "Niedostępne" (link → "/ustawienia"), wiersz Python nie
it("błąd runtimes nie psuje listy")                       // /api/settings/runtimes → 500 → tabela widoczna, brak "Niedostępne"
```

- [ ] **Step 2:** `npx vitest run src/pages/Zadania.test.tsx` → nowe testy FAIL.
- [ ] **Step 3:** Zaimplementuj.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat: plakietka Niedostępne przy zadaniach bez środowiska`.

### Task 6: Test całości i dokumentacja

**Files:**
- Create: `frontend/e2e/ustawienia.spec.ts`
- Modify: `README.md`, `frontend/dist`

- [ ] **Step 1:** `ustawienia.spec.ts`: `/ustawienia` → „Wykryto” przy Pythonie; zmiana limitu Pythona na 7 → „Zapisz” → przeładowanie strony → pole ma 7, potem przywrócenie 5 i zapis; „Pobierz kopię” → `page.waitForEvent("download")`, nazwa `leetrepeat-RRRR-MM-DD.db`; przywrócenie tej kopii przez `setInputFiles` → dialog „Przywróć” → „Przywrócono bazę”. Sprzątanie: usuń pliki `e2e-test.db.przed-przywroceniem-*` w `afterAll` (Node `fs`).
- [ ] **Step 2:** `PW_CHROME=/usr/bin/google-chrome PYTHON=$(pwd)/../.venv/bin/python npx playwright test` (w `frontend/`) → PASS.
- [ ] **Step 3:** README: sekcja „Ustawienia i kopia zapasowa” — gdzie ustawić ścieżki (np. `C:\Program Files\dotnet\dotnet.exe` na Windows), limity, jak pobrać i przywrócić kopię, gdzie ląduje kopia poprzedniej bazy; usuń z README zdania o „wartościach domyślnych do czasu Etapu 5”, jeśli są.
- [ ] **Step 4:** Pełna weryfikacja: `.venv/bin/pytest -q`, `npx vitest run`, `npm run build`, Playwright, świeży klon `npx tsc -b` → PASS.
- [ ] **Step 5:** Commit `test: e2e Ustawień i kopii zapasowej, README`.
