# Odłożone drobiazgi

Uwagi z przeglądów, które **świadomie nie zostały poprawione**. Żadna nie psuje danych ani bezpieczeństwa.
Wszystkie odłożone drobiazgi z Etapów 1–5 zamknął Etap 6 (`plans/2026-11-09-etap-6-porzadki.md`);
poniżej to, co zostało po przeglądzie samego Etapu 6.

Gdy coś stąd naprawisz — usuń wiersz.

## Do zrobienia

| # | Gdzie | Co się dzieje | Jak naprawić |
|---|---|---|---|
| 1 | `frontend/src/pages/Sesja.tsx` (notatki) | Zapis notatki zadania usuniętego w innej karcie (404) albo inny błąd 4xx jest ponawiany co 5 s bez końca, z komunikatem „ponowię za chwilę” | Ponawiać tylko przy braku połączenia (status 0) i błędach 5xx; przy 4xx pokazać „Nie udało się zapisać notatki” i przestać |
| 2 | `frontend/src/pages/Sesja.tsx` (`pagehide`) | Po powrocie do strony przyciskiem „Wstecz” (pamięć podręczna przeglądarki) nieudane notatki czekają, aż nie powiedzie się kolejny zapis | Nasłuchiwać `pageshow` z `event.persisted` i wtedy uruchomić ponowienie |
| 3 | `frontend/src/pages/Ustawienia.tsx` (`watchBackupTime`) | Odświeżanie „ostatniej kopii” działa jeszcze po wyjściu z Ustawień; kilka kliknięć „Pobierz kopię” uruchamia kilka odświeżań naraz | Trzymać timer w `useRef`, czyścić przy odmontowaniu i przed nowym startem |
| 4 | `main.py` (trasa frontendu) | `HEAD /api/...` zwraca 404 (JSON) zamiast 405 | W trasie frontendu dla ścieżek `api/*` przy metodzie HEAD zwracać 405 |
| 5 | testy | Brak testu wyszukiwania z ukośnikiem `\` (działa poprawnie — sprawdzone ręcznie) i testu, że ponowienie przy 404 się kończy (po naprawie #1) | Dopisać `test_search_backslash_literal` w `tests/test_tasks_service.py` i test w `Sesja.test.tsx` |

## Świadomie bez zmian

| Co | Dlaczego |
|---|---|
| Anulowane pobieranie kopii nadal ustawia „ostatnia kopia” | Serwer wysyła plik i nie wie, czy przeglądarka go zapisała. Obca strona nie może tego wywołać (Etap 6). |
| Ścieżka do programu, który istnieje, ale nie działa (np. `/bin/false`), daje wyniki testów z błędem zamiast 503 | Program istnieje; Ustawienia i tak pokazują przy nim „Nie wykryto”. |
| Plik kopii od obcej osoby może zawierać zadania z cudzym kodem | Tak działają zadania z kodem; przywrócenie wymaga Twojego potwierdzenia. |
