import { screen } from "@testing-library/react"
import { renderApp, stubApi } from "@/test/renderApp"

const Q = (id: number, title: string, language = "python", due_date = "2026-11-09") =>
  ({ id, title, language, difficulty: "easy", due_date })

const DASH = {
  due_count: 4, due_by_language: { python: 2, csharp: 2 }, new_count: 2, streak: 12, longest_streak: 18,
  library_count: 24, library_by_language: { python: 16, csharp: 8 },
  queue: [Q(1, "Two Sum"), Q(2, "Valid Parentheses", "csharp"), Q(3, "Group Anagrams")],
  queue_rest: ["Binary Search", "Contains Duplicate", "Merge Intervals"], session_count: 6,
  progress_by_language: [
    { language: "python", consolidated: 10, learning: 4, new: 2 },
    { language: "csharp", consolidated: 4, learning: 3, new: 1 },
  ],
  next_review_date: "2026-11-10", completed_today: 0,
}

function show(overrides: Partial<typeof DASH> = {}) {
  stubApi({ "/api/dashboard": { ...DASH, ...overrides }, "/api/health": { status: "ok", version: "3.0.0" } })
  return renderApp("/")
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 10, 9, 10, 0))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("plan na dziś", async () => {
  show()
  expect(await screen.findByText("6 małych kroków. Wiedza na dłużej.")).toBeInTheDocument()
  expect(screen.getByText("Około 15 minut")).toBeInTheDocument()
  expect(screen.getByText("Najpierw: Two Sum · Python")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Zacznij powtórkę/ })).toHaveAttribute("href", "/sesja")
  expect(screen.getByRole("link", { name: "Two Sum" })).toHaveAttribute("href", "/sesja?zadanie=1")
  expect(screen.getByText("+ 3 zadania: Binary Search, Contains Duplicate, Merge Intervals")).toBeInTheDocument()
  expect(screen.getByText("Dziś w kolejce")).toBeInTheDocument()
  expect(screen.getByText("2 Python · 2 C#")).toBeInTheDocument()
  expect(screen.getByText("Najdłuższa seria: 18 dni")).toBeInTheDocument()
  expect(screen.getByText("10 utrwalonych · 4 w nauce · 2 nowe")).toBeInTheDocument()
  expect(screen.getByText("Utrwalone = odstęp co najmniej 21 dni.")).toBeInTheDocument()
})

it("wszystko zrobione", async () => {
  show({ completed_today: 6, due_count: 0, new_count: 0, session_count: 0, queue: [Q(5, "Valid Anagram", "python", "2026-11-10")], queue_rest: [] })
  expect(await screen.findByText("Wszystko zrobione na dziś")).toBeInTheDocument()
  expect(screen.getByText("Ukończone powtórki: 6 z 6")).toBeInTheDocument()
  expect(screen.getByText("Kolejne powtórki: jutro, 10 listopada")).toBeInTheDocument()
  expect(screen.getByText("Następne w kolejce")).toBeInTheDocument()
  expect(screen.getByText("Dziś możesz już odpocząć. Postęp został zapisany.")).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /Zacznij nowe zadania/ })).not.toBeInTheDocument()
})

it("wszystko zrobione, ale są nowe zadania", async () => {
  show({ completed_today: 2, due_count: 0, new_count: 3, session_count: 3 })
  expect(await screen.findByText("Wszystko zrobione na dziś")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Zacznij nowe zadania/ })).toHaveAttribute("href", "/sesja")
})

it("pusta biblioteka", async () => {
  show({ library_count: 0, due_count: 0, new_count: 0, session_count: 0, queue: [], queue_rest: [] })
  expect(await screen.findByText("Zacznij od pierwszego zadania")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Dodaj zadanie" })).toHaveAttribute("href", "/zadania/nowe")
})

it("nic do powtórki", async () => {
  show({ library_count: 3, due_count: 0, new_count: 0, session_count: 0, completed_today: 0, queue: [Q(5, "Valid Anagram", "python", "2026-11-12")], queue_rest: [] })
  expect(await screen.findByText("Na dziś nic do powtórki")).toBeInTheDocument()
  expect(screen.getByText("Kolejne powtórki: jutro, 10 listopada")).toBeInTheDocument()
})

it("język bez zadań", async () => {                                      // Review Focus 3
  const { container } = show({
    progress_by_language: [
      { language: "python", consolidated: 1, learning: 0, new: 0 },
      { language: "csharp", consolidated: 0, learning: 0, new: 0 },
    ],
  })
  expect(await screen.findByText("0 zadań · 0 utrwalonych")).toBeInTheDocument()
  expect(container.innerHTML).not.toContain("NaN")
})

it("nagłówek z datą", async () => {
  show()
  expect(await screen.findByRole("heading", { level: 1, name: "Dobry dzień na trochę kodu." })).toBeInTheDocument()
  expect(screen.getByText("Poniedziałek, 9 listopada 2026 · Twoja codzienna praktyka")).toBeInTheDocument()
})

it("odmiana liczebników na Pulpicie", async () => {                   // przegląd końcowy: „1 utrwalonych”, „5 nowe”
  show({
    progress_by_language: [
      { language: "python", consolidated: 1, learning: 0, new: 5 },
      { language: "csharp", consolidated: 5, learning: 2, new: 1 },
    ],
  })
  expect(await screen.findByText("1 utrwalone · 0 w nauce · 5 nowych")).toBeInTheDocument()
  expect(screen.getByText("6 zadań · 1 utrwalone")).toBeInTheDocument()
  expect(screen.getByText("5 utrwalonych · 2 w nauce · 1 nowe")).toBeInTheDocument()
})

it("odmiana w stanie „wszystko zrobione”", async () => {
  show({ completed_today: 1, due_count: 0, new_count: 0, session_count: 0, queue: [], queue_rest: [] })
  expect(await screen.findByText("1 ukończone")).toBeInTheDocument()
  expect(screen.getByText("Ukończone powtórki: 1 z 1")).toBeInTheDocument()
})
