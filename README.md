# LeetRepeat v3

Twoje własne „LeetCode + Anki”: tworzysz zadania programistyczne w **Pythonie** i **C#**, rozwiązujesz je
w edytorze z automatycznymi testami, a po każdym zadaniu oceniasz, jak dobrze pamiętałeś — aplikacja
sama planuje kolejną powtórkę.

Działa lokalnie na Twoim komputerze (`http://127.0.0.1:8000`), bez internetu i bez kont.

> Stan: **wszystkie 5 etapów gotowe** — biblioteka zadań, sesja powtórek z testami i oceną, Pulpit,
> Statystyki i Ustawienia (środowisko, limity, kopia zapasowa). Spec i plany w `docs/superpowers/`.
> Poprzednia wersja: [Mejsooon/leetrepeat](https://github.com/Mejsooon/leetrepeat) (archiwum).

## Wymagania

| Co | Po co |
|---|---|
| Python 3.11+ | serwer aplikacji i uruchamianie zadań w Pythonie |
| .NET 10 SDK (opcjonalnie) | uruchamianie zadań w C# |
| Node.js 20+ (opcjonalnie) | tylko do zmian we frontendzie — na co dzień niepotrzebny |

## Instalacja — Parrot OS / Linux

```bash
git clone https://github.com/Mejsooon/leetrepeat_shadcnui
cd leetrepeat_shadcnui
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

.NET 10 SDK — oficjalnym skryptem Microsoftu:

```bash
wget https://dot.net/v1/dotnet-install.sh
bash dotnet-install.sh --channel 10.0
echo 'export DOTNET_ROOT=$HOME/.dotnet' >> ~/.bashrc
echo 'export PATH=$PATH:$HOME/.dotnet' >> ~/.bashrc
source ~/.bashrc
dotnet --version        # powinno pokazać 10.x
```

## Instalacja — Windows (PowerShell)

```powershell
git clone https://github.com/Mejsooon/leetrepeat_shadcnui
cd leetrepeat_shadcnui
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
winget install Microsoft.DotNet.SDK.10
dotnet --version        # w NOWYM oknie PowerShell; powinno pokazać 10.x
```

> Jeśli PowerShell blokuje `Activate.ps1`, uruchom raz:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Uruchomienie

```bash
python main.py
```

Otwórz **http://127.0.0.1:8000**. Serwer zatrzymujesz przez `Ctrl+C`.

Serwer nasłuchuje tylko na `127.0.0.1` i przyjmuje wyłącznie adresy `127.0.0.1` / `localhost` — nikt z sieci
ani obca strona internetowa nie może wysłać Ci kodu do wykonania. Dodatkowo każde żądanie zmieniające dane
(w tym uruchomienie testów i pobranie kopii bazy) przysłane z innej strony w przeglądarce (nagłówki `Origin` /
`Sec-Fetch-Site`) dostaje 403 — także ze strony na innym porcie tego komputera. Dozwolone są tylko port serwera
(8000) i serwer deweloperski Vite (5173).

## Sesja i skróty

„Powtórka” prowadzi przez kolejkę: najpierw zadania do powtórki (najstarszy termin), potem nowe.
Kod uruchamia się lokalnie na Twoim komputerze. Po rozwiązaniu oceniasz, jak łatwo było odtworzyć rozwiązanie:

| Ocena | Nowe zadanie | Kolejne powtórki |
|---|---|---|
| Znowu | dziś, wraca na koniec sesji | dziś, wraca na koniec sesji |
| Trudne | za 1 dzień | odstęp × 1,2 (co najmniej +1 dzień) |
| Dobre | za 3 dni | odstęp × 2,5 |
| Łatwe | za 7 dni | odstęp × 3,5 |

| Skrót | Działanie |
|---|---|
| `Ctrl/⌘ + Enter` | uruchom testy (także w edytorze) |
| `1`–`4` | wybór oceny (Znowu / Trudne / Dobre / Łatwe) |
| `Ctrl/⌘ + K` | wyszukiwarka zadań w bibliotece |

Kliknięcie tytułu w bibliotece otwiera sesję z jednym zadaniem. Notatki zapisują się same sekundę po pisaniu.

## Pulpit i Statystyki

- **Pulpit** pokazuje plan na dziś (zadania do powtórki + nowe), a gdy wszystko zrobione — termin kolejnych powtórek.
- **Seria dni** — ile dni z rzędu była co najmniej jedna ocena, licząc od dziś (a gdy dziś jeszcze nic — od wczoraj).
- **Skuteczność** — udane powtórki (Trudne, Dobre, Łatwe) / wszystkie oceny w okresie. „Znowu” to ponowna nauka.
- **Utrwalone** — zadania z odstępem co najmniej 21 dni.
- **Statystyki** domyślnie za ostatnie 14 dni; okres zmienisz listą albo adresem `/statystyki?dni=7|14|30|90`.

## Ustawienia i kopia zapasowa

**Środowisko.** Ekran Ustawienia pokazuje, czy aplikacja widzi Pythona i .NET („Wykryto” + wersja albo
„Nie wykryto”). Gdy czegoś brakuje, zadania w tym języku mają w bibliotece plakietkę „Niedostępne”.

- Domyślny Python to pierwszy działający z `python3`, `py`, `python` (fałszywy skrót `python3` ze Sklepu
  Windows jest pomijany). .NET domyślnie to `dotnet` z `PATH`.
- Własną ścieżkę wpisujesz w polu „Ścieżka do programu”, np. `C:\Program Files\dotnet\dotnet.exe`
  albo `/home/ty/.dotnet/dotnet`, potem „Zapisz” i „Sprawdź ponownie”.
- Limit czasu (1–300 s) dotyczy jednego uruchomienia testów. Domyślnie Python 5 s, C# 20 s (pierwsza
  kompilacja C# trwa kilka sekund).

**Kopia zapasowa.** Wszystko (zadania, testy, historia ocen, ustawienia) jest w jednym pliku `leetrepeat.db`.

- „Pobierz kopię” zapisuje plik `leetrepeat-RRRR-MM-DD.db` w Pobranych.
- „Wybierz plik…” przywraca bazę z takiego pliku. Aplikacja najpierw sprawdza, czy to naprawdę baza
  LeetRepeat — jeśli nie, nic się nie zmienia. Przed podmianą zapisuje obecną bazę obok, jako
  `leetrepeat.db.przed-przywroceniem-RRRRMMDD-GGMMSS.db`, więc zawsze możesz wrócić.

## Dane

Wszystko jest w jednym pliku **`leetrepeat.db`** obok `main.py` (kopia zapasowa = skopiuj ten plik).
Inna lokalizacja: zmienna `LEETREPEAT_DB`, np. `LEETREPEAT_DB=~/zadania.db python main.py`.

## Import zadań

Ze starej wersji (LeetRepeat v2) — przenosi zadania i testy; historia ocen nie jest przenoszona,
wszystkie zadania startują jako **Nowe** z trudnością „Łatwe”:

```bash
python scripts/import_v2.py ŚCIEŻKA/DO/STAREJ/leetrepeat.db
```

Gotowy zestaw zadań z folderu `seeds/`:

```bash
python scripts/import_seed.py seeds/python_variables.json
```

| Plik | Zawartość |
|---|---|
| `python_variables.json` | 10 zadań z notatki PYTHON — VARIABLES (tag „Zmienne”) |

Zadania o tym samym tytule i języku, które już są w bazie, są pomijane — import można powtarzać.
Oba skrypty przyjmują `--db INNA_BAZA.db` (domyślnie `leetrepeat.db` obok `main.py` albo `LEETREPEAT_DB`).

## Zmiany we frontendzie

Zbudowany frontend (`frontend/dist`) jest w repo, dlatego do codziennego używania Node.js nie jest potrzebny.
Po zmianach w `frontend/src`:

```bash
cd frontend
npm install
npm run build           # aktualizuje frontend/dist — commituj go razem ze zmianami
```

Tryb deweloperski z odświeżaniem na żywo: w jednym terminalu `python main.py`, w drugim `cd frontend && npm run dev`
(adres z terminala Vite; zapytania `/api` idą do FastAPI).

Komponenty interfejsu to [shadcn/ui](https://ui.shadcn.com) w `frontend/src/components/ui/` — nowe dodasz przez
`npx shadcn@latest add <nazwa>` (w katalogu `frontend`).

## Testy

```bash
pytest                              # backend (testy C# pomijane bez dotnet)
cd frontend && npm test             # frontend (Vitest)
cd frontend && npx playwright install chromium && npm run e2e   # test całości w przeglądarce
```

Test całości sam uruchamia `python main.py` z osobną bazą `e2e-test.db`. Inny Python: zmienna `PYTHON`;
własny Chrome zamiast pobranego przez Playwright: `PW_CHROME=/ścieżka/do/chrome`.

## Struktura projektu

```
leetrepeat_shadcnui/
├── main.py                  # start: FastAPI, /api i serwowanie frontend/dist
├── backend/
│   ├── api/                 # routes.py (endpointy HTTP), schemas.py (walidacja danych)
│   ├── services/            # tasks.py (status, tagi, daty), runner.py (uruchamianie kodu Python/C#)
│   ├── repository/tasks.py  # cały SQL zadań, testów i tagów
│   └── core/database.py     # połączenie z SQLite i tabele
├── scripts/                 # import_v2.py, import_seed.py
├── seeds/                   # gotowe zestawy zadań (JSON)
├── frontend/
│   ├── src/                 # React + TypeScript + Tailwind + shadcn/ui
│   │   ├── api.ts           # wszystkie wywołania API
│   │   ├── theme.tsx        # motyw jasny / ciemny / systemowy
│   │   ├── components/      # AppSidebar, SiteHeader, AppLayout, CodeEditor (Monaco), TagInput, ui/
│   │   └── pages/           # ekrany
│   ├── e2e/                 # test całości (Playwright)
│   └── dist/                # zbudowany frontend (w repo)
├── tests/                   # pytest
└── docs/superpowers/        # specyfikacja i plany
```
