import { render, screen } from "@testing-library/react"
import type { RunResult } from "@/api"
import { TestResults } from "@/components/TestResults"

function result(status: RunResult["status"], extra: Partial<RunResult> = {}): RunResult {
  return { status, input: "two_sum([3,3], 6)", expected: "[0, 1]", actual: status === "pass" ? "[0, 1]" : "[0, 0]", message: null, ...extra }
}

function show(results: RunResult[]) {
  return render(<TestResults response={{ results, duration_ms: 42 }} />)
}

it("liczy niezaliczone po polsku", () => {
  const { unmount } = show([result("pass"), result("fail"), result("pass")])
  expect(screen.getByText("1 test nie przeszedł")).toBeInTheDocument()
  expect(screen.getByText("2/3 poprawne · 42 ms")).toBeInTheDocument()
  unmount()
  const second = show([result("fail"), result("fail"), result("pass")])
  expect(screen.getByText("2 testy nie przeszły")).toBeInTheDocument()
  second.unmount()
  show(Array.from({ length: 5 }, () => result("fail")))
  expect(screen.getByText("5 testów nie przeszło")).toBeInTheDocument()
})

it("wszystkie zaliczone", () => {
  show([result("pass"), result("pass"), result("pass")])
  expect(screen.getByText("Wszystkie testy przeszły")).toBeInTheDocument()
  expect(screen.getByText("3/3 poprawne · 42 ms")).toBeInTheDocument()
  expect(screen.getByText("Test 3 · wynik poprawny")).toBeInTheDocument()
})

it("otwiera pierwszy niezaliczony test", () => {
  show([result("pass"), result("fail"), result("fail")])
  expect(screen.getByText("Test 2 · nieprawidłowy wynik")).toBeInTheDocument()
  expect(screen.getByText("Oczekiwany wynik")).toBeInTheDocument()
  expect(screen.getByText("[0, 1]")).toBeInTheDocument()
  expect(screen.getByText("[0, 0]")).toBeInTheDocument()
})

it("timeout i błąd pokazują komunikat", () => {
  const { unmount } = show([result("timeout", { actual: null, message: "Kod działał dłużej niż 5 s" })])
  expect(screen.getByText("Test 1 · przekroczony czas")).toBeInTheDocument()
  expect(screen.getByText("Kod działał dłużej niż 5 s")).toBeInTheDocument()
  expect(screen.queryByText("Otrzymany wynik")).not.toBeInTheDocument()
  unmount()
  show([result("error", { actual: null, message: "NameError: x" })])
  expect(screen.getByText("Test 1 · błąd")).toBeInTheDocument()
  expect(screen.getByText("NameError: x")).toBeInTheDocument()
})
