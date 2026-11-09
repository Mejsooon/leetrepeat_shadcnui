"""Polskie komunikaty dla błędów walidacji (Pydantic v2) — frontend pokazuje je użytkownikowi wprost."""

MESSAGES = {
    "int_parsing": "Wpisz liczbę całkowitą",
    "int_type": "Wpisz liczbę całkowitą",
    "int_from_float": "Wpisz liczbę całkowitą",
    "date_parsing": "Nieprawidłowa data — użyj formatu RRRR-MM-DD",
    "date_from_datetime_parsing": "Nieprawidłowa data — użyj formatu RRRR-MM-DD",
    "date_from_datetime_inexact": "Nieprawidłowa data — użyj formatu RRRR-MM-DD",
    "date_type": "Nieprawidłowa data — użyj formatu RRRR-MM-DD",
    "literal_error": "Niedozwolona wartość",
    "enum": "Niedozwolona wartość",
    "missing": "Brak wymaganego pola",
    "string_too_long": "Tekst jest za długi",
    "too_short": "Za mało elementów",
    "too_long": "Za dużo elementów",
    "greater_than_equal": "Wartość spoza dozwolonego zakresu",
    "less_than_equal": "Wartość spoza dozwolonego zakresu",
    "greater_than": "Wartość spoza dozwolonego zakresu",
    "less_than": "Wartość spoza dozwolonego zakresu",
    "json_invalid": "Nieprawidłowe dane (JSON)",
}


def polish_message(error: dict) -> str:
    # Nasze własne walidatory (ValueError) mają już polski tekst — Pydantic dokleja tylko przedrostek
    if error.get("type") == "value_error":
        return str(error.get("msg", "")).removeprefix("Value error, ")
    return MESSAGES.get(error.get("type", ""), "Nieprawidłowe dane")
