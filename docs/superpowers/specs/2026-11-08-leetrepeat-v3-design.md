# LeetRepeat v3 — nowa aplikacja pod design shadcn/ui

Data: 2026-11-08
Status: do przeglądu przez użytkownika
Repo: `Mejsooon/leetrepeat_shadcnui`. Poprzednia wersja: repo `Mejsooon/leetrepeat` (v2) — zostaje jako archiwum.
Wygląd: artefakt Design „LeetRepeat – shadcn/ui” (https://claude.ai/artifact/1VrdsLiDCNaxMDw8qk4UhY) — 11 ekranów + komponent AppSidebar; przenieść 1:1 na komponenty shadcn/ui.

## 1. Cel

Lokalna aplikacja „LeetCode + Anki”: użytkownik tworzy zadania programistyczne w Pythonie i C#, rozwiązuje je w edytorze z automatycznymi testami i ocenia, jak dobrze pamiętał rozwiązanie; aplikacja planuje kolejną powtórkę i pokazuje statystyki nauki.

### Kryteria sukcesu

1. Wszystkie ekrany z artefaktu działają na prawdziwych danych: Pulpit (2 stany), Zadania (biblioteka + pusty stan), Rozwiązywanie (błąd testu / testy poprawne), Ocena, Statystyki, Dodawanie, Edycja, Ustawienia.
2. Ocena (Znowu / Trudne / Dobre / Łatwe) zmienia termin zgodnie z tabelą w sekcji 4.
3. Testy działają dla Pythona i C#, dla typów `function` i `program`.
4. Zadania i testy ze starej bazy v2 da się zaimportować jednym poleceniem.
5. Aplikacja działa offline na Parrot OS i Windows po `git pull` + `python main.py` — bez Node.js.
6. Motyw jasny, ciemny i systemowy.

### Decyzje użytkownika (z rozmowy 2026-11-08)

| Temat | Decyzja |
|---|---|
| Zakres | pełna aplikacja pod design z artefaktu |
| Repo | nowe repo; `leetrepeat` = archiwum |
| Backend | FastAPI + SQLite, warstwy `api/ services/ repository/ core/`; runner przeniesiony z v2 i dostosowany |
| Dane | jednorazowy import zadań i testów z v2; historia ocen od zera |
| Testy zadań | wiersze `wywołanie → oczekiwany wynik` + typ `function` / `program` (jak v2) |
| Oceny | 4 stopnie, proste mnożniki (sekcja 4) |
| Status zadania | według odstępu: Nowe / Do powtórki / W nauce (< 21 dni) / Utrwalone (≥ 21 dni) |
| Czas rozwiązania | od otwarcia zadania do kliknięcia oceny |
| Tagi | wolne, z podpowiedziami już użytych; filtr w bibliotece |
| Motyw | jasny + ciemny, domyślnie systemowy |
| Frontend | React + TypeScript + Tailwind + shadcn/ui, Vite, React Router, `fetch` w jednym `api.ts` |
| Ustawienia | motyw, kopia zapasowa bazy, ścieżki i limity Pythona / .NET |
| Uruchamianie | zbudowany frontend (`frontend/dist`) w repo; `python main.py` |
| Cofanie oceny (z v2) | pominięte — nie ma go w designie |
| Styl kodu | prosty, liniowy, bez rozbijania logiki na wiele małych funkcji pomocniczych |

## 2. Architektura

```
Przeglądarka: React (frontend/dist) ──HTTP 127.0.0.1──▶ FastAPI (main.py)
                                                         ├─ api/routes.py, api/schemas.py
                                                         ├─ services/ (tasks, scheduler, stats, runner, settings)
                                                         ├─ repository/ (cały SQL)
                                                         └─ core/database.py ──▶ leetrepeat.db
```

### Struktura repo

```
leetrepeat_shadcnui/
├── main.py                  # tworzy FastAPI, podpina /api i serwuje frontend/dist (SPA: nieznane ścieżki → index.html)
├── backend/
│   ├── api/                 # routes.py, schemas.py
│   ├── services/            # tasks.py, scheduler.py, stats.py, runner.py, settings.py
│   ├── repository/          # tasks.py, reviews.py, settings.py
│   └── core/                # database.py (połączenie, tworzenie tabel)
├── frontend/
│   ├── src/
│   │   ├── api.ts           # wszystkie wywołania fetch + typy
│   │   ├── components/ui/   # komponenty shadcn/ui
│   │   ├── components/      # AppSidebar, SiteHeader, CodeEditor, TestResults
│   │   └── pages/           # Pulpit, Zadania, ZadanieForm, Sesja, Statystyki, Ustawienia
│   └── dist/                # zbudowany frontend — commitowany do repo
├── scripts/import_v2.py     # import zadań ze starej bazy
├── seeds/                   # zestawy zadań (format v3)
├── tests/                   # pytest
└── README.md                # instalacja Parrot / Windows, uruchomienie, budowanie frontendu
```

- Serwer nasłuchuje tylko na `127.0.0.1:8000` i przyjmuje wyłącznie nagłówek `Host` `127.0.0.1` / `localhost` (ochrona `/api/run` przed obcymi stronami — jak w v2).
- Wszystkie zasoby frontendu (Monaco, czcionki Geist / Geist Mono) są wbudowane w `dist/` — brak CDN, działa offline.
- Node.js potrzebny tylko do zmian we frontendzie (`npm run build` przed commitem).

## 3. Model danych (SQLite)

### `tasks`

| Kolumna | Typ | Opis |
|---|---|---|
| id | INTEGER PK | |
| title | TEXT NOT NULL | |
| language | TEXT NOT NULL | `python` │ `csharp` |
| kind | TEXT NOT NULL | `function` │ `program` |
| difficulty | TEXT NOT NULL | `easy` │ `medium` │ `hard` |
| description | TEXT NOT NULL | Markdown |
| starter_code | TEXT NOT NULL DEFAULT '' | |
| hint | TEXT NOT NULL DEFAULT '' | |
| solution | TEXT NOT NULL | |
| notes | TEXT NOT NULL DEFAULT '' | notatki użytkownika z sesji |
| created_at, updated_at | TEXT NOT NULL | ISO datetime |
| interval_days | REAL NOT NULL DEFAULT 0 | 0 = nowe albo po „Znowu” |
| due_date | TEXT NOT NULL | ISO date; nowe zadanie = dzień utworzenia |

### `tags`, `task_tags`

| Tabela | Kolumny |
|---|---|
| tags | `id` INTEGER PK, `name` TEXT NOT NULL UNIQUE COLLATE NOCASE |
| task_tags | `task_id` FK → tasks ON DELETE CASCADE, `tag_id` FK → tags ON DELETE CASCADE, PK (task_id, tag_id) |

Tag bez zadań jest usuwany przy zapisie zadania.

### `tests`

`id`, `task_id` (FK, CASCADE), `position`, `input`, `expected` — znaczenie jak w v2 (`function`: wyrażenie wywołania → JSON; `program`: stdin → stdout). Zadanie ma co najmniej jeden test.

### `reviews`

| Kolumna | Typ | Opis |
|---|---|---|
| id | INTEGER PK | |
| task_id | FK → tasks ON DELETE CASCADE | |
| rating | TEXT NOT NULL | `again` │ `hard` │ `good` │ `easy` |
| reviewed_at | TEXT NOT NULL | ISO datetime |
| duration_seconds | INTEGER NOT NULL | od otwarcia zadania do oceny |
| tests_passed, tests_total | INTEGER NULL | ostatnie uruchomienie; NULL = nie uruchomiono |
| hint_used, solution_used | INTEGER NOT NULL | 0/1 |

### `settings`

`key` TEXT PK, `value` TEXT. Klucze: `python_path` (domyślnie wykryty `python3`/`py`), `dotnet_path` (domyślnie `dotnet`), `python_timeout_s` (5), `csharp_timeout_s` (20). Motyw trzyma przeglądarka (`localStorage`).

## 4. Harmonogram (`services/scheduler.py`)

| Ocena | Zadanie nowe (`interval_days` = 0) | Kolejne powtórki |
|---|---|---|
| Znowu | odstęp 0, termin dziś | odstęp 0, termin dziś |
| Trudne | 1 dzień | odstęp × 1,2, co najmniej +1 dzień |
| Dobre | 3 dni | odstęp × 2,5 |
| Łatwe | 7 dni | odstęp × 3,5 |

`due_date` = dziś + zaokrąglony odstęp. „Znowu” w sesji: frontend przenosi zadanie na koniec kolejki; jeśli sesja się skończy, zadanie zostaje „Do powtórki”.

### Pojęcia wyliczane

| Pojęcie | Reguła |
|---|---|
| Nowe | brak ocen |
| Do powtórki | ma oceny i `due_date ≤ dziś` |
| W nauce | ma oceny, `due_date > dziś`, odstęp < 21 |
| Utrwalone | ma oceny, `due_date > dziś`, odstęp ≥ 21 |
| Udana powtórka | ocena ≠ `again` |
| Skuteczność | udane / wszystkie oceny w okresie |
| Seria dni | liczba kolejnych dni z ≥ 1 oceną, licząc wstecz od dziś (gdy dziś brak ocen — od wczoraj) |
| Kolejność sesji | najpierw Do powtórki (najstarszy termin pierwszy), potem Nowe (najstarsze utworzone pierwsze) |

## 5. API (`/api`)

| Metoda | Ścieżka | Odpowiedź / działanie |
|---|---|---|
| GET | `/dashboard?language=` | `{due_count, due_by_language, new_count, streak, longest_streak, library_count, library_by_language, queue: [3 zadania], queue_rest: [tytuły], progress_by_language: [{language, consolidated, learning, new}], next_review_date, completed_today}` |
| GET | `/tasks?q=&language=&difficulty=&status=&tag=&page=1&page_size=10` | `{items: [{id, title, tags, language, difficulty, due_date, status}], total, page, pages}`; `q` szuka w tytule i treści bez rozróżniania wielkości liter |
| GET | `/tasks/{id}` | pełne zadanie + `tests`, `tags`, `last_reviewed_at` |
| POST | `/tasks` | tworzy zadanie; 201 |
| PUT | `/tasks/{id}` | zmienia treść, testy, tagi; nie zmienia harmonogramu ani historii |
| PATCH | `/tasks/{id}/notes` | `{notes}` |
| DELETE | `/tasks/{id}` | 204 |
| GET | `/tags` | `[{name, count}]` |
| GET | `/session?language=` | kolejka sesji (kolejność z sekcji 4) |
| POST | `/run` | `{language, kind, code, tests}` → `[{status: pass│fail│error│timeout, input, expected, actual, message}]` + `duration_ms` |
| GET | `/tasks/{id}/review-preview` | 4 elementy `{rating, interval_days, due_date}` dla przycisków oceny |
| POST | `/tasks/{id}/review` | `{rating, duration_seconds, tests_passed, tests_total, hint_used, solution_used}` → `{interval_days, due_date}` |
| GET | `/stats?from=&to=` | `{reviews_count, by_language, success_rate, success_by_language, avg_duration_s, avg_duration_by_language, streak, longest_streak, daily: [{date, python, csharp}], weak_tasks: [4 najniższa skuteczność, min. 3 oceny], recent_days: [{date, count, success_rate}]}` |
| GET/PUT | `/settings` | ścieżki i limity |
| GET | `/settings/runtimes` | `{python: {found, version, path}, dotnet: {found, version, path}}` |
| GET | `/backup` | plik `leetrepeat-RRRR-MM-DD.db` |
| POST | `/backup/restore` | plik `.db`; sprawdza schemat; zapisuje kopię obecnej bazy obok; 409 dla nieprawidłowego pliku |

Błędy: 404 brak zadania, 422 walidacja (Pydantic), 409 opisane wyżej. Cały SQL w `repository/`, decyzje w `services/`, adresy w `api/routes.py`.

## 6. Frontend

### Trasy

| Adres | Ekran |
|---|---|
| `/` | Pulpit — „plan na dziś”, a gdy `completed_today` i brak do powtórki — „wszystko zrobione” |
| `/zadania` | Zadania — tabela; pusta baza → pusty stan z 3 krokami |
| `/zadania/nowe`, `/zadania/:id/edycja` | formularz |
| `/sesja` | Rozwiązywanie → Ocena dla kolejnych zadań z `/api/session` |
| `/statystyki` | Statystyki (domyślnie ostatnie 14 dni) |
| `/ustawienia` | Ustawienia |

### Zachowania

| Funkcja | Opis |
|---|---|
| Edytor | Monaco z npm, wbudowany w `dist`; motyw edytora zgodny z motywem aplikacji |
| Czcionki | Geist / Geist Mono z npm, wbudowane |
| Motyw | klasa `dark` na `<html>`, `localStorage`, domyślnie systemowy; przełącznik w panelu bocznym i w Ustawieniach |
| Sesja | kolejka w stanie strony; „Znowu” → na koniec; pasek „Powtórka N z M”; stoper od otwarcia zadania; „Zakończ sesję” wraca na Pulpit |
| Skróty | `Ctrl/⌘+Enter` uruchamia testy (także w edytorze); `1`–`4` wybierają ocenę poza polami tekstowymi; `Ctrl/⌘+K` → wyszukiwarka zadań |
| Notatki | zakładka „Notatki” zapisuje przez `PATCH` po 1 s bez pisania |
| Tagi | pole z podpowiedziami z `/api/tags` |
| Treść zadania | Markdown (`react-markdown`), w formularzu przełącznik „Podgląd” |
| Wykresy | shadcn `chart` (Recharts), słupki Python / C# |

### Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| API nie odpowiada | baner z przyciskiem „Spróbuj ponownie” |
| Brak Pythona / .NET | plakietka „Niedostępne” przy zadaniach; alert z linkiem do Ustawień |
| Timeout testu | status `timeout`, „Kod działał dłużej niż N s” |
| Błąd kompilacji / wyjątek | status `error`, komunikat w bloku kodu |
| Walidacja formularza | komunikat pod polem; „Zapisz” nieaktywne |
| Niezapisane zmiany | „Zmiany niezapisane” w nagłówku; potwierdzenie przy wyjściu |
| Zły plik kopii | alert, obecne dane nietknięte |

## 7. Import z v2 (`scripts/import_v2.py`)

`python scripts/import_v2.py ŚCIEŻKA/leetrepeat.db` — przenosi zadania i testy; `difficulty` = `easy`, brak tagów, `notes` = '', `interval_days` = 0, `due_date` = dziś; pomija zadania o tym samym tytule i języku (import można powtarzać). Seed `python_variables.json` przeniesiony w formacie v3.

## 8. Testy

| Warstwa | Narzędzie | Zakres |
|---|---|---|
| Harmonogram | pytest | 4 oceny × nowe / w nauce; minimum +1 dzień; Znowu → dziś |
| Repository + services | pytest, SQLite w pamięci | tagi NOCASE, filtry, paginacja, statusy, seria, skuteczność, statystyki |
| Runner | pytest (z v2) | Python/C# × function/program, timeout; C# pomijany bez `dotnet` |
| API | pytest + TestClient | wszystkie endpointy, kody 404/409/422, ochrona `Host` |
| Import | pytest | baza v2 → v3 |
| Frontend | Vitest + Testing Library | sesja (Znowu na koniec, skróty, stoper), walidacja formularza |
| Całość | Playwright (headless) | Pulpit → sesja → testy → ocena → Pulpit, oba motywy |

Implementacja metodą TDD.

## 9. Kolejność budowy

1. Fundament: repo, backend (baza, runner), frontend (Vite + shadcn + AppSidebar + motyw), serwowanie `dist`.
2. Zadania: CRUD, tagi, formularz, biblioteka, import v2.
3. Sesja: `/session`, `/run`, harmonogram, Rozwiązywanie + Ocena.
4. Pulpit i Statystyki.
5. Ustawienia: runtime’y, limity, kopia zapasowa.

## 10. Poza zakresem

Konta i synchronizacja, wersja online, cofanie ocen, inne języki niż Python i C#, zewnętrzne paczki NuGet/pip w zadaniach, tryb mobilny jako osobna aplikacja (strona ma działać na wąskim ekranie, ale nie jest optymalizowana pod telefon).
