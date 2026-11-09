import type { Difficulty, Kind, Language, Status } from "@/api"

// Polskie nazwy wartości z bazy — używane na wszystkich ekranach
export const LANGUAGE_LABEL: Record<Language, string> = { python: "Python", csharp: "C#" }

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Łatwe", medium: "Średnie", hard: "Trudne" }

export const STATUS_LABEL: Record<Status, string> = {
  new: "Nowe",
  due: "Do powtórki",
  learning: "W nauce",
  consolidated: "Utrwalone",
}

export const KIND_LABEL: Record<Kind, string> = { function: "Funkcja", program: "Program (wejście/wyjście)" }
