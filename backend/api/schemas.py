"""Jak wyglądają dane z frontendu (walidacja Pydantic). Komunikaty błędów po polsku."""
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator


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
