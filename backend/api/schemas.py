"""Jak wyglądają dane z frontendu (walidacja Pydantic). Komunikaty błędów po polsku."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class TestIn(BaseModel):
    input: str
    expected: str


class TaskIn(BaseModel):
    title: str
    language: Literal["python", "csharp"]
    kind: Literal["function", "program"]
    difficulty: Literal["easy", "medium", "hard"]
    description: str
    starter_code: str = ""
    hint: str = ""
    solution: str
    tests: list[TestIn]
    tags: list[str] = []

    @field_validator("title", "description", "solution")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Pole nie może być puste")
        return value

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return value.strip()                  # treść i kod zostają bez zmian (wcięcia mają znaczenie)

    @field_validator("tests")
    @classmethod
    def at_least_one_test(cls, value: list[TestIn]) -> list[TestIn]:
        if not value:
            raise ValueError("Dodaj co najmniej jeden test")
        return value

    @model_validator(mode="after")
    def function_calls_not_empty(self):
        # W zadaniu typu „funkcja” test to wywołanie — puste nie ma sensu. Program może dostać puste wejście.
        if self.kind == "function" and any(not test.input.strip() for test in self.tests):
            raise ValueError("Wywołanie funkcji nie może być puste")
        return self


class NotesIn(BaseModel):
    notes: str


class RunIn(BaseModel):
    language: Literal["python", "csharp"]
    kind: Literal["function", "program"]
    code: str = Field(max_length=100_000)
    tests: list[TestIn] = Field(min_length=1, max_length=50)


class ReviewIn(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]
    duration_seconds: int = Field(ge=0)
    tests_passed: int | None = Field(default=None, ge=0)
    tests_total: int | None = Field(default=None, ge=0)
    hint_used: bool
    solution_used: bool

    @model_validator(mode="after")
    def tests_count_consistent(self):
        # Albo testów nie uruchomiono (oba None), albo poprawnych jest najwyżej tyle, ile wszystkich
        if (self.tests_passed is None) != (self.tests_total is None):
            raise ValueError("Nieprawidłowa liczba testów")
        if self.tests_passed is not None and self.tests_passed > self.tests_total:
            raise ValueError("Nieprawidłowa liczba testów")
        return self


class SettingsIn(BaseModel):
    python_path: str
    dotnet_path: str
    python_timeout_s: int
    csharp_timeout_s: int

    @field_validator("python_path", "dotnet_path")
    @classmethod
    def path_ok(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Pole nie może być puste")
        if len(value) > 500:
            raise ValueError("Ścieżka może mieć najwyżej 500 znaków")
        return value

    @field_validator("python_timeout_s", "csharp_timeout_s")
    @classmethod
    def timeout_ok(cls, value: int) -> int:
        if not 1 <= value <= 300:
            raise ValueError("Limit musi być od 1 do 300 sekund")
        return value
