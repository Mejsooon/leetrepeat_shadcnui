// Instrukcja dla AI kopiowana przyciskiem „Skopiuj instrukcję dla AI” w oknie importu (spec importu §3).
// Przykład w bloku ```json jest sprawdzany w teście — musi być poprawnym plikiem importu.
export const IMPORT_PROMPT = `Utwórz zadania programistyczne do aplikacji LeetRepeat (nauka programowania z powtórkami).

Zwróć listę zadań w formacie JSON. Każde zadanie to obiekt z polami:

| Pole | Wymagane | Zasada |
|---|---|---|
| title | tak | krótki tytuł po polsku |
| language | tak | "python" albo "csharp" |
| kind | tak | "function" (funkcja sprawdzana wywołaniami) albo "program" (program czytający wejście i wypisujący wynik) |
| description | tak | treść zadania po polsku, Markdown |
| solution | tak | pełne, poprawne rozwiązanie |
| tests | tak | 3–6 testów { "input": "...", "expected": "..." }, oba jako tekst |
| difficulty | nie | "easy", "medium" albo "hard" (domyślnie "easy") |
| tags | nie | lista tagów po polsku, np. ["Listy", "Pętle"] |
| starter_code | nie | kod startowy — tylko sygnatura funkcji, bez rozwiązania |
| hint | nie | krótka podpowiedź po polsku |

Zasady testów:
- kind "function": "input" to wywołanie funkcji, np. "suma([1, 2])"; "expected" to wynik zapisany jako JSON: liczba 3 → "3", tekst "kot" → "\\"kot\\"", True → "true", None → "null", lista → "[1, 2]".
- kind "program": "input" to dane na standardowe wejście, "expected" to dokładnie to, co program wypisze.

Wymagania:
- "solution" musi przechodzić wszystkie testy — sprawdź to przed odpowiedzią.
- Testy obejmują przypadki brzegowe (pusta lista, zero, liczby ujemne itp.).
- Treść, podpowiedź i tagi po polsku.

Przykład (dwa zadania):

\`\`\`json
[
  {
    "title": "Suma liczb parzystych",
    "language": "python",
    "kind": "function",
    "difficulty": "easy",
    "tags": ["Listy", "Pętle"],
    "description": "Napisz funkcję \`suma_parzystych(lista)\`, która zwraca sumę liczb parzystych z listy.",
    "starter_code": "def suma_parzystych(lista):\\n    pass\\n",
    "hint": "Liczba jest parzysta, gdy x % 2 == 0.",
    "solution": "def suma_parzystych(lista):\\n    return sum(x for x in lista if x % 2 == 0)\\n",
    "tests": [
      { "input": "suma_parzystych([1, 2, 3, 4])", "expected": "6" },
      { "input": "suma_parzystych([])", "expected": "0" },
      { "input": "suma_parzystych([-2, 5, 8])", "expected": "6" }
    ]
  },
  {
    "title": "Podwój liczbę",
    "language": "csharp",
    "kind": "program",
    "difficulty": "easy",
    "tags": ["Wejście i wyjście"],
    "description": "Wczytaj liczbę całkowitą i wypisz ją pomnożoną przez 2.",
    "starter_code": "",
    "hint": "int.Parse(Console.ReadLine()) zamienia wczytany tekst na liczbę.",
    "solution": "int x = int.Parse(Console.ReadLine());\\nConsole.WriteLine(x * 2);",
    "tests": [
      { "input": "4", "expected": "8" },
      { "input": "0", "expected": "0" },
      { "input": "-3", "expected": "-6" }
    ]
  }
]
\`\`\`

Odpowiedz wyłącznie jednym blokiem kodu JSON z listą zadań, bez komentarzy przed ani po nim.

Temat zadań: `
