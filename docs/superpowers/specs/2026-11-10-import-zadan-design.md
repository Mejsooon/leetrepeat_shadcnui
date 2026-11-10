# Import zadań z JSON (np. wygenerowanych przez AI)

Data: 2026-11-10
Status: do przeglądu przez użytkownika
Dotyczy: spec v3 (`2026-11-08-leetrepeat-v3-design.md`) — ten dokument go rozszerza; w razie sprzeczności w temacie importu ma pierwszeństwo.

## 1. Cel

Użytkownik prosi AI (np. w czacie) o zestaw zadań, dostaje JSON i wgrywa go do LeetRepeat z poziomu aplikacji — bez terminala.

### Kryteria sukcesu

1. JSON wklejony z czatu albo wybrany z dysku pokazuje podgląd zadań ze statusem przy każdym.
2. Rozwiązanie każdego poprawnego zadania jest uruchamiane na jego testach; zadanie, którego rozwiązanie nie przechodzi testów, jest domyślnie odznaczone.
3. Jeden przycisk „Importuj N zadań” dodaje zaznaczone zadania w jednej transakcji (wszystkie albo żadne).
4. Przycisk „Skopiuj instrukcję dla AI” daje prompt, po którym AI zwraca plik zgodny z formatem.
5. `seeds/python_variables.json` importuje się przez okno bez błędów; `scripts/import_seed.py` działa jak dotąd, na tej samej logice.

### Decyzje użytkownika (z rozmowy 2026-11-10)

| Temat | Decyzja |
|---|---|
| Format | tylko JSON (format z `seeds/`); `.md` poza zakresem |
| Wejście | jedno okno: pole do wklejenia + „Wybierz plik” (wczytuje plik do pola) |
| Przebieg | podgląd → checkboxy → „Importuj N zadań” |
| Instrukcja dla AI | przycisk „Skopiuj instrukcję dla AI” w oknie importu |
| Sprawdzanie rozwiązań | automatycznie w podglądzie przez istniejące `/api/run` |
| Architektura | backend waliduje i importuje, frontend uruchamia rozwiązania po kolei (podejście 1) |
| Nieznane pola | ignorowane po cichu |

## 2. Format pliku

Tablica JSON obiektów-zadań — identyczna jak w `seeds/`.

| Pole | Wymagane | Zasada |
|---|---|---|
| `title` | ✓ | niepuste (przycinane) |
| `language` | ✓ | `python` │ `csharp` |
| `kind` | ✓ | `function` │ `program` |
| `description` | ✓ | Markdown, niepuste |
| `solution` | ✓ | niepuste |
| `tests` | ✓ | ≥ 1 element `{input, expected}`, oba tekstem |
| `difficulty` | – | `easy` │ `medium` │ `hard`; domyślnie `easy` |
| `tags` | – | lista tekstów; domyślnie `[]` |
| `starter_code`, `hint` | – | domyślnie `""` |

Walidacja pól = istniejący `TaskIn` (`backend/api/schemas.py`) — te same reguły co formularz.

### Tolerancja przy wklejaniu

- Tekst owinięty w blok kodu Markdown (trzy grawisy, opcjonalnie `json`, na początku i końcu po przycięciu białych znaków) — znaczniki są usuwane przed parsowaniem.
- Pojedynczy obiekt (nie lista) = lista z jednym zadaniem.
- Nieznane pola są ignorowane.
- Limity: najwyżej 100 zadań i 1 MB tekstu na jeden import.

### Duplikaty

Duplikat = ten sam `title` (po przycięciu) i `language` co zadanie w bazie **albo** wcześniejsze zadanie w tym samym pliku. Porównanie dokładne, jak dziś w `import_seed.py`.

## 3. Instrukcja dla AI

Stała tekstowa w `frontend/src/lib/importPrompt.ts`, po polsku, kopiowana do schowka. Zawiera:

1. Rolę i zadanie: „Utwórz zadania do aplikacji LeetRepeat…”; na końcu miejsce, gdzie użytkownik dopisuje temat (np. „5 zadań o listach w Pythonie”).
2. Tabelę pól z sekcji 2.
3. Zasady testów:
   - `function`: `input` = wyrażenie wywołania funkcji (np. `suma([1, 2])`), `expected` = wynik zapisany jako JSON (`"\"int\""` dla tekstu, `3` dla liczby, `true` dla prawdy logicznej, `null` dla braku wartości);
   - `program`: `input` = dane na standardowe wejście, `expected` = dokładnie to, co program wypisze.
4. Wymogi jakości: `solution` przechodzi wszystkie testy; `starter_code` zawiera tylko sygnaturę; treść, podpowiedź i tagi po polsku; 3–6 testów z przypadkami brzegowymi.
5. Dwa krótkie przykłady: jedno zadanie `function` (Python) i jedno `program` (C#).
6. Format odpowiedzi: wyłącznie jeden blok kodu JSON z listą zadań, bez komentarzy.

## 4. Backend

### `backend/services/importer.py` (nowy)

**`preview_import(con, text) -> list[dict]`** — kolejno:

1. usuwa owinięcie blokiem kodu;
2. `json.loads`; błąd → `ImportFormatError("Nieprawidłowy JSON w linii L, kolumnie K")`;
3. obiekt → lista; inny typ niż lista → `ImportFormatError("Oczekiwano listy zadań")`; pusta lista → `"Brak zadań do importu"`; > 100 → `"Najwyżej 100 zadań naraz — podziel plik"`;
4. dla każdego elementu (pozycja `index` od 0):
   - nie obiekt → `invalid`, „To nie jest zadanie”;
   - brak `difficulty` → `easy`;
   - `TaskIn(**element)`; błąd → `invalid`, `"<pole>: <polish_message(pierwszy błąd)>"` (pole = `loc` złączone kropkami, np. `tests.0.expected`);
   - para (tytuł, język) już w bazie (`repo.task_exists`) albo wcześniej w tym pliku → `duplicate`, „Już jest w bibliotece” / „Powtórzone w pliku”;
   - inaczej → `new`, `task` = `TaskIn(...).model_dump()`.

Element wyniku: `{index, title, language, status, message, task}` (`title`/`language` = to, co było w pliku, albo `null`; `task` tylko dla `new`).

**`import_tasks(con, tasks, now) -> dict`** — w jednej transakcji: dla każdego zadania ponownie `repo.task_exists` (duplikat → `skipped += 1`), inaczej istniejące `create_task`. Wyjątek → `con.rollback()` i ponowne zgłoszenie. Na końcu `con.commit()`. Zwraca `{imported, skipped}`.

### `backend/repository/tasks.py`

Nowa funkcja `task_exists(con, title, language) -> bool` (`SELECT 1 FROM tasks WHERE title = ? AND language = ?`). Zastępuje SQL wpisany dziś w `scripts/import_seed.py`.

### API (`backend/api/routes.py`, `schemas.py`)

| Metoda | Ścieżka | Wejście | Odpowiedź |
|---|---|---|---|
| POST | `/api/import/preview` | `ImportPreviewIn {text: str}` | 200 `{items: [...]}`; 413 „Tekst jest za duży (najwyżej 1 MB)”, gdy `text` > 1 MB (liczone w bajtach UTF-8); 422 z komunikatem `ImportFormatError` |
| POST | `/api/import` | `ImportIn {tasks: list[TaskIn]}` (1–100 elementów) | 201 `{imported, skipped}`; 422 walidacja |

- Oba przechodzą przez `block_cross_site` (POST pod `/api/`).
- Sprawdzanie rozwiązań nie ma własnego endpointu — frontend używa `POST /api/run` z `code = solution`.

### `scripts/import_seed.py`

Czyta plik jako tekst → `preview_import` → wypisuje „Pominięto „…”: komunikat” dla `invalid` → `import_tasks` dla `new`. Komunikat końcowy jak dotąd: „Zaimportowano X zadań, pominięto Y”. Rozwiązań nie uruchamia.

## 5. Frontend

### Wejście do okna

- Przycisk „Importuj” (`variant="outline"`) obok „Dodaj zadanie” w nagłówku ekranu Zadania i obok „Dodaj pierwsze zadanie” w pustym stanie.
- Komponent `frontend/src/components/ImportDialog.tsx` (shadcn `Dialog`); nowy komponent shadcn `checkbox`.
- `api.ts`: `previewImport(text)`, `importTasks(tasks)` + typy.

### Krok 1 — wklejanie

- „Skopiuj instrukcję dla AI” → schowek; etykieta „Skopiowano ✓” przez 2 s.
- „Wybierz plik…” (`accept=".json,application/json"`): plik > 1 MB → błąd bez odczytu; inaczej treść do pola i od razu podgląd.
- Wklejenie do pustego pola od razu uruchamia podgląd; przy ręcznym pisaniu — przycisk „Sprawdź” (nieaktywny przy pustym polu).
- Pod polem stała linijka: „Sprawdzanie uruchomi rozwiązania na Twoim komputerze — importuj tylko zadania z zaufanego źródła.”
- Błąd 413/422 — komunikat pod polem; tekst zostaje do poprawy.

### Krok 2 — podgląd

Wiersz: checkbox, tytuł (albo „(bez tytułu) #N”), język, status z komunikatem.

| Status | Tekst | Checkbox |
|---|---|---|
| sprawdzanie | „sprawdzam…” | zaznaczony |
| przechodzi | „Rozwiązanie przechodzi testy” | zaznaczony |
| nie przechodzi | „Nie przechodzi X z Y testów” (`fail`/`error`/`timeout` = nie przechodzi) | **odznaczony**, można zaznaczyć |
| 503 z `/api/run` | „Nie sprawdzono (brak Pythona)” / „(brak .NET)” | zaznaczony |
| inny błąd `/api/run` | „Nie udało się sprawdzić” | zaznaczony |
| `duplicate` | komunikat z backendu | wyłączony, odznaczony |
| `invalid` | komunikat z backendu | wyłączony, odznaczony |

- Rozwiązania są uruchamiane po kolei (jedno `/api/run` naraz), w kolejności z pliku; nad listą „Sprawdzam rozwiązania: N z M…”.
- „Importuj N zadań” (odmiana przez `lib/plural.ts`) — nieaktywny w trakcie sprawdzania i gdy N = 0.
- „Wstecz” wraca do kroku 1 z tym samym tekstem. Zamknięcie okna albo „Wstecz” przerywa dalsze sprawdzanie (wyniki spóźnionych odpowiedzi są ignorowane).

### Krok 3 — wynik

- Sukces: alert „Zaimportowano N zadań” (+ „, pominięto M — już istnieją”, gdy M > 0) i „Zamknij”; lista w tle odświeża się.
- Błąd importu (500 / brak połączenia): alert „Nie zaimportowano żadnego zadania — spróbuj ponownie”; podgląd i zaznaczenia zostają.

## 6. Obsługa błędów — zestawienie

| Sytuacja | Zachowanie |
|---|---|
| Plik > 1 MB | „Plik jest za duży (najwyżej 1 MB)”, bez odczytu |
| Pliku nie da się odczytać | „Nie udało się odczytać pliku” |
| Zły JSON / nie lista / `[]` / > 100 | 422, komunikat pod polem |
| Tekst > 1 MB (wklejony) | 413, komunikat pod polem |
| Błędne zadanie | wiersz `invalid` z polem i komunikatem |
| Brak Pythona / .NET | „Nie sprawdzono”, zadanie zaznaczone |
| Błąd zapisu | rollback, alert, podgląd zostaje |
| Duplikat dodany po podglądzie | pominięty, wliczony do „pominięto” |
| Żądanie z obcej strony | 403 (`block_cross_site`) |

## 7. Testy (TDD)

| Warstwa | Plik | Zakres |
|---|---|---|
| Serwis | `tests/test_importer.py` | usuwanie bloku kodu; obiekt → lista; zły JSON z linią i kolumną; nie-lista; `[]`; > 100; `invalid` z nazwą pola; element nie-obiekt; domyślne `difficulty`; duplikat w bazie; duplikat w pliku; `import_tasks` zapisuje testy i tagi; rollback przy wyjątku; duplikat dodany po podglądzie pominięty; `seeds/python_variables.json` bez `invalid` |
| Repository | `tests/test_tasks_service.py` | `task_exists` |
| API | `tests/test_api_import.py` | 200 / 201 / 413 / 422; 403 z obcym `Origin` |
| Skrypt | `tests/test_import.py` | `import_seed.py` — dotychczasowe zachowanie i komunikaty |
| Frontend | `frontend/src/components/ImportDialog.test.tsx` | kopiowanie instrukcji; wczytanie pliku; zbyt duży plik; błąd 422 pod polem; statusy i domyślne zaznaczenia; ⚠ odznaczone; 503 → „Nie sprawdzono”; przycisk nieaktywny w trakcie; licznik z odmianą; wynik po imporcie; błąd importu |
| E2E | `frontend/e2e/import.spec.ts` | Zadania → Importuj → wklejenie 2 zadań → import → oba w bibliotece |

## 8. Dokumentacja

- `rulings.md`: „Import tylko JSON — `.md` odłożony (decyzja użytkownika 2026-11-10)”; „Logika importu w `services/importer.py`, wspólna dla okna i `import_seed.py`”.
- `README.md`: krótka sekcja „Import zadań od AI”.
- `frontend/dist` przebudowany i zacommitowany razem ze zmianami frontendu.

## 9. Poza zakresem

Import `.md`; ostrzeżenia o nieznanych polach; nadpisywanie albo scalanie duplikatów; edycja zadania w podglądzie; import historii ocen; równoległe sprawdzanie rozwiązań.
