# LeetRepeat v3 — wskazówki dla Claude

Lokalna aplikacja do nauki programowania („LeetCode + Anki”): zadania w Pythonie i C# z testami,
sesje powtórek, ocena Znowu / Trudne / Dobre / Łatwe i harmonogram. Działa na `127.0.0.1:8000`, offline.
Właściciel: Mejson (początkujący programista, Parrot OS + Windows). **Odpowiadaj i pisz teksty po polsku.**

## Najpierw przeczytaj

1. `docs/superpowers/specs/2026-11-08-leetrepeat-v3-design.md` — spec, nadrzędne źródło prawdy
   (model danych, harmonogram §4, API §5, ekrany i obsługa błędów §6, testy §8).
2. `docs/superpowers/rulings.md` — decyzje podjęte w trakcie pracy (gdzie kod odbiega od planów i dlaczego).
3. `docs/superpowers/odlozone.md` — znane, świadomie odłożone drobiazgi.
4. `docs/superpowers/plans/` — plany Etapów 1–6 (historia; wszystkie zrealizowane).

## Struktura

- `main.py` — FastAPI: `TrustedHostMiddleware`, blokada żądań z obcych stron (`block_cross_site`),
  polskie błędy 422, serwowanie `frontend/dist`.
- `backend/api/` — `routes.py` (adresy), `schemas.py` (Pydantic), `errors.py` (polskie komunikaty).
- `backend/services/` — decyzje: `tasks`, `scheduler`, `stats`, `settings`, `backup`, `runner`.
- `backend/repository/` — **cały SQL** (i tylko SQL).
- `frontend/src/` — React 19 + TS + Tailwind 4 + shadcn/ui; `pages/`, `components/`, `lib/` (`dates`, `plural`, `platform`), `api.ts`.
- `scripts/` — import z v2 i seedów; `seeds/` — zadania startowe.

## Zasady

- **Prosty, liniowy kod.** Bez skakania po wielu funkcjach pomocniczych; komentarze po polsku tam, gdzie decyzja nie jest oczywista.
- **SQL tylko w `repository/`**, decyzje w `services/`, adresy w `api/routes.py`.
- **Teksty w UI po polsku**, z poprawną odmianą liczebników (`lib/plural.ts`).
- **Daty we frontendzie w czasie lokalnym** (`lib/dates.ts`), nigdy `toISOString()` do liczenia „dziś”.
- **Bezpieczeństwo:** `/api/run` uruchamia kod na komputerze użytkownika. Nowe endpointy zmieniające dane
  muszą przechodzić przez `block_cross_site` (dzieje się samo dla POST/PUT/PATCH/DELETE pod `/api/`).
- **Komponenty shadcn/ui:** `npx shadcn@latest add <nazwa>` w `frontend/` (importy: `@/components/ui`, `@/lib/utils`).
- **`frontend/dist` jest w repo:** po każdej zmianie frontendu `cd frontend && npm run build` i commit razem ze zmianami.
- **TDD:** najpierw test, który pada, potem kod. Każda poprawka błędu ma swój test.

## Testy

```bash
.venv/bin/pytest -q                       # backend (testy C# pomijane bez dotnet)
cd frontend && npx vitest run             # frontend
cd frontend && npx tsc -b                 # typy
cd frontend && npm run e2e                # Playwright (sam uruchamia serwer z bazą e2e-test.db)
```

Bez pobranej przeglądarki Playwrighta: `PW_CHROME=/ścieżka/do/chrome PYTHON=$(pwd)/../.venv/bin/python npx playwright test`.

## Praca nad nowymi funkcjami

Workflow Superpowers: brainstorming → aktualizacja specu (albo nowy spec) → plan w `docs/superpowers/plans/`
→ implementacja na osobnej gałęzi → przegląd → PR. Nowe decyzje dopisuj do `rulings.md`,
odłożone uwagi do `odlozone.md`.
