# Decyzje podjęte w trakcie pracy

Ustalenia, których **nie rozstrzygał spec ani plan** — podjęte w trakcie implementacji albo po przeglądzie
końcowym etapu. Spec (`specs/2026-11-08-leetrepeat-v3-design.md`) jest nadrzędny; plany
(`plans/`) mówią, co miało powstać; ten plik mówi, gdzie i dlaczego zrobiono inaczej albo dokładniej.

Kolumna „Koszt pomyłki” mówi, ile kosztuje zmiana zdania.

> **Etapy 1–2:** szczegółowy dziennik decyzji z tych etapów nie zachował się. Poniżej są ustalenia
> techniczne i poprawki, które z nich zostały w kodzie i w opisach PR #2 i #3. Etapy 3–6 są kompletne.

## Etap 1 — fundament

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| Komponenty shadcn/ui skopiowane ze źródeł na GitHubie (`shadcn-ui/ui@8ab2771`, rejestr `new-york-v4`), a nie przez `npx shadcn add` | CLI nie mogło pobrać rejestru w środowisku pracy; kod jest ten sam | Brak — można dalej używać CLI |
| `tsconfig` bez `baseUrl`, same `paths` | TypeScript 7 odrzuca `baseUrl` | Brak |
| `frontend/dist` w repo (wyjątki w `.gitignore`) | Na co dzień wystarczy `python main.py`, bez Node | Większe repo; po każdej zmianie frontendu trzeba `npm run build` |
| Playwright na systemowym Chrome (`PW_CHROME`), interpreter przez `PYTHON` | Pobieranie przeglądarki Playwrighta było zablokowane | Brak — lokalnie działa też `npx playwright install chromium` |
| `request()` obsługuje odpowiedź błędu, która nie jest JSON-em | Przegląd: tekstowa odpowiedź 500 kończyła się wyjątkiem `SyntaxError` | Brak |

## Etap 2 — zadania

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| Monaco bez usług języków TS/CSS/HTML/JSON (wtyczka w `vite.config.ts`) | `dist` 5,9 MB zamiast 15 MB; aplikacja edytuje tylko Python i C# | Brak podpowiedzi TS w edytorze (niepotrzebne) |
| Kliknięcie „Zapisz” przy błędach pokazuje komunikaty przy wszystkich polach | Przegląd: wcześniej nic się nie działo | Brak |
| Błąd wczytania zadania (np. 500) pokazuje alert zamiast pustego formularza | Przegląd: zapis pustego formularza nadpisałby prawdziwe zadanie | Brak |
| Tag wpisany bez Entera dodaje się po opuszczeniu pola | Przegląd: tag ginął przy zapisie | Brak |
| Wyszukiwarka zsynchronizowana z adresem, `setParams` w formie funkcji | Przegląd: pole i adres się rozjeżdżały | Brak |

## Etap 3 — sesja

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| „Przejdź do oceny” dostępne zawsze; domyślnie „Dobre” po zaliczonych testach, inaczej „Znowu” | Spec nie mówi; ocena „Znowu” bez testów ma sens | Jedna linia |
| Po „Znowu” zadanie wraca z kodem startowym | Ćwiczenie pamięci, nie poprawianie | Jedna linia |
| Daty dalsze niż „Jutro” w formacie „1 gru 2026” (jak w bibliotece) | Spójność z Etapem 2 | Format tekstu |
| Stoper restartuje się przy każdym zadaniu | Inaczej po 65 s pokazywał 01:04 | Brak |
| Pasek sesji (tytuł, licznik, stoper) widoczny także na ekranie oceny | Prostsze niż osobny nagłówek | Układ |
| Przy ostatnim zadaniu „Następne w sesji” pokazuje „To ostatnie zadanie w sesji”, nawet gdy „Znowu” je przywróci | Tekst „wróci jeszcze w tej sesji” i tak to mówi | Tekst |
| Plakietki testów to przyciski, nie zakładki shadcn | Tak w designie | Wygląd |
| `Ctrl+Enter` czyta kod z `ref`, nie ze stanu | Monaco zgłasza zmianę i skrót poza Reactem — uruchamiał się stary kod (błąd znaleziony przez niestabilny test) | Brak |
| Blokada żądań z obcych stron dla wszystkich zmian pod `/api`, nie tylko `/run` | Obca strona mogła wysłać kod do uruchomienia z prawdziwym nagłówkiem Host | Brak |
| Testy Playwright po kolei (`workers: 1`) i sprzątanie zadań | Jeden serwer i jedna baza dla wszystkich plików | ~2 s dłużej |

## Etap 4 — Pulpit i Statystyki

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| Pulpit liczy kroki z całej sesji (do powtórki + nowe), pole `session_count` w `/api/dashboard` | Tyle faktycznie rozwiążesz po „Zacznij powtórkę” | Jedno pole |
| „Około N minut” = 2,5 min na zadanie, w górę do 5 | 6 zadań → 15 min jak w designie | Jedna linia |
| Okres Statystyk z listy 7/14/30/90 dni (`?dni=`), bez kalendarza | Prościej; spec mówi tylko o domyślnych 14 dniach | Nowy komponent |
| Skuteczność: „Dobrze” ≥ 80%, „Średnio” 60–79%, „Słabo” < 60% | Spec nie podaje progów | Trzy liczby |
| Słabe zadania: ≥ 3 oceny w okresie i skuteczność < 100% | Zadania bez porażek nie wymagają uwagi | Jeden warunek |
| „Utrwalone” = ma oceny, termin w przyszłości i odstęp ≥ 21 dni (spec), a nie tekst z designu „3 udane z rzędu” | Spec wiąże; Pulpit musi zgadzać się z filtrem w bibliotece (poprawione po przeglądzie) | Brak |
| Karta serii w panelu bocznym ukryta przy serii 0 | „Seria trwa już 0 dni” brzmi źle | Widoczność karty |
| Średni czas w formacie „06:24” jak stoper sesji | Spójność | Format |

## Etap 5 — Ustawienia

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| Domyślny Python: pierwszy z `python3`, `py`, `python`, który odpowiada „Python 3” | Spec mówi „wykryty python3/py”; pomija fałszywy skrót ze Sklepu Windows | Brak |
| Limity czasu 1–300 s dla obu języków | Spec nie podaje zakresu | Dwie liczby |
| Plik kopii wysyłany jako surowe ciało żądania (bez `python-multipart`), limit 200 MB | Bez nowej zależności | Brak |
| Przywracanie: najpierw pełna walidacja pliku, potem kopia obecnej bazy obok, na końcu podmiana przez backup API SQLite | Zły plik nie może niczego zmienić | Brak |
| Plik do sprawdzenia otwierany zwykłą ścieżką, nie adresem URI | Foldery z `#`, `?`, `%` w nazwie (np. `C#projekty`) psuły przywracanie (przegląd) | Brak |
| Po przywróceniu formularz wczytuje ścieżki i limity z przywróconej bazy | Przegląd: pokazywał stare wartości | Brak |
| Kolejność kart: Wygląd → Kopia zapasowa → Środowisko | Jak w designie | Układ |

## Etap 6 — porządki

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| `detail` błędu 422 to zawsze jeden polski komunikat (tekst), nie lista | Frontend pokazuje go wprost | Testy czytające listę trzeba było poprawić |
| Zapis z przeglądarki tylko z portu samego serwera; serwer deweloperski Vite przechodzi, bo przekazuje swój adres (`Host: localhost:5173`) | Stała 5173 przepuszczała każdą inną aplikację Vite (przegląd) | Gdyby proxy Vite dostało `changeOrigin: true` — `npm run dev` przestanie móc zapisywać |
| Zły port w nagłówku `Origin` (np. `localhost:abc`) → 403 | Bezpieczniej | Brak |
| Import (`import_seed`, `import_v2`) waliduje zadania jak formularz, ale zapisuje je w niezmienionej postaci | Niepoprawne zadania pomijane z komunikatem; bez zmian dla poprawnych | Brak |
| Nieudane notatki czekają na ponowienie osobno dla każdego zadania; ponawiany jest tylko najnowszy wysłany tekst | Pisanie w zadaniu B nie gubi ponowienia dla A; stary błąd nie nadpisuje nowej notatki (przegląd) | Brak |
| Po przywróceniu kopii „ostatnia kopia” zostaje z obecnej bazy | Opisuje Twoje kopie, nie datę zapisaną w pliku | Jedna linia |
| Nagłówek kolejki na Pulpicie: „Dziś w kolejce”, gdy `session_count > 0` | Lista to wtedy dzisiejsza sesja, także po „wszystko zrobione” | Tekst |
| ⌘ na Macu wykrywany przez `navigator.platform` (+ `userAgent`) | Wciąż działa wszędzie | „Ctrl” na przyszłej przeglądarce Maca |
| Data w podpowiedzi wykresu bez testu | Recharts nie renderuje się w jsdom | Sama liczba dnia w podpowiedzi |

## Import zadań z JSON (2026-11-10)

Spec: `specs/2026-11-10-import-zadan-design.md`, plan: `plans/2026-11-10-import-zadan.md`.

| Decyzja | Dlaczego | Koszt pomyłki |
|---|---|---|
| Import tylko z JSON; `.md` odłożony | Decyzja użytkownika (2026-11-10) — JSON od AI jest prosty i już obsługiwany | Parser `.md` jako osobna funkcja |
| Logika importu w `services/importer.py`, wspólna dla okna i `import_seed.py` | Jedno źródło reguł (walidacja `TaskIn`, duplikaty, transakcja) | Brak |
| Wklejenie wykrywane przez porównanie wartości pola z tekstem ze schowka (`onPaste` → `onChange`) | Działa przy pustym polu i po Ctrl+A, Ctrl+V; zwykłe pisanie nie uruchamia podglądu | Wklejenie w środek tekstu wymaga „Sprawdź” |
| Okno importu ma jedno stałe miejsce na ekranie Zadania (otwierane przyciskiem z nagłówka albo pustego stanu) | E2E: przy pierwszym imporcie lista przełączała się z pustego stanu na tabelę i okno z wynikiem znikało | Brak |
| `import_seed.py` wypisuje komunikat z nazwą pola („tests: Dodaj co najmniej jeden test”) | Ten sam komunikat co w oknie importu | Tekst w terminalu |
| Duplikaty w podglądzie mają opis „Pozycja N w pliku” | Backend zwraca `task` tylko dla nowych zadań | Wygląd |
| `Progress` (shadcn) przekazuje `value` do Radix Root | Pasek ma `aria-valuenow` | Brak |
| Licznik zadań w panelu bocznym odświeża się dopiero po zmianie ekranu, nie od razu po imporcie | `AppLayout` odświeża go przy zmianie adresu; spec o nim milczy | Licznik nieaktualny do pierwszej nawigacji |
