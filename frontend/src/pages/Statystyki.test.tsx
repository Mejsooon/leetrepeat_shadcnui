import { act, screen, waitFor } from "@testing-library/react"
import type { Stats } from "@/api"
import { renderApp, stubApi } from "@/test/renderApp"

const daily = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(2026, 9, 27 + i)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { date: iso, python: 6, csharp: 3 }
})

const STATS: Stats = {
  reviews_count: 128, by_language: { python: 84, csharp: 44 },
  success_rate: 0.86, success_by_language: { python: { successful: 74, total: 84 }, csharp: { successful: 36, total: 44 } },
  avg_duration_s: 384, avg_duration_by_language: { python: 348, csharp: 452 },
  streak: 12, longest_streak: 18, daily,
  weak_tasks: [{ id: 7, title: "Group Anagrams", language: "python", successful: 4, total: 8 }],
  recent_days: [{ date: "2026-11-09", count: 10, success_rate: 0.9 }, { date: "2026-11-08", count: 0, success_rate: null }],
}

function show(path = "/statystyki", overrides: Partial<Stats> = {}) {
  const fetchMock = stubApi({ "/api/stats": { ...STATS, ...overrides }, "/api/health": { status: "ok", version: "3.0.0" } })
  renderApp(path)
  return fetchMock
}

function statsUrl(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.map((c) => c[0]).find((u) => u.startsWith("/api/stats"))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 10, 9, 9, 20))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("domyślnie 14 dni", async () => {
  const fetchMock = show()
  expect(await screen.findByText("27 paź – 9 lis 2026")).toBeInTheDocument()
  expect(statsUrl(fetchMock)).toBe("/api/stats?from=2026-10-27&to=2026-11-09")
  expect(screen.getByRole("heading", { level: 1, name: "Zobacz, jak rośniesz." })).toBeInTheDocument()
})

it("zmiana okresu w URL", async () => {                                  // Review Focus 2
  const fetchMock = show("/statystyki?dni=30")
  await waitFor(() => expect(statsUrl(fetchMock)).toBe("/api/stats?from=2026-10-11&to=2026-11-09"))
})

it("zły okres w URL wraca do 14 dni", async () => {                       // Review Focus 2
  const fetchMock = show("/statystyki?dni=abc")
  await waitFor(() => expect(statsUrl(fetchMock)).toBe("/api/stats?from=2026-10-27&to=2026-11-09"))
})

it("karty z danymi", async () => {
  show()
  expect(await screen.findByText("128")).toBeInTheDocument()
  expect(screen.getByText("84 Python · 44 C#")).toBeInTheDocument()
  expect(screen.getByText("86%")).toBeInTheDocument()
  expect(screen.getByText("Dobrze")).toBeInTheDocument()
  expect(screen.getByText("110 z 128 bez ponownej nauki")).toBeInTheDocument()
  expect(screen.getByText("06:24")).toBeInTheDocument()
  expect(screen.getByText("Python 05:48 · C# 07:32")).toBeInTheDocument()
  expect(screen.getByText("74 z 84 udanych")).toBeInTheDocument()
  expect(screen.getByText("Stan na 9 listopada 2026, 09:20", { exact: false })).toBeInTheDocument()
})

it("brak ocen pokazuje kreski", async () => {                             // Review Focus 1
  show("/statystyki", {
    reviews_count: 0, by_language: { python: 0, csharp: 0 }, success_rate: null,
    success_by_language: { python: { successful: 0, total: 0 }, csharp: { successful: 0, total: 0 } },
    avg_duration_s: null, avg_duration_by_language: { python: null, csharp: null }, weak_tasks: [],
  })
  expect(await screen.findByText("Wykonane powtórki")).toBeInTheDocument()
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2)
  expect(document.body.innerHTML).not.toContain("NaN")
  expect(screen.queryByText("Dobrze")).not.toBeInTheDocument()
  expect(screen.getAllByText("Brak ocen")).toHaveLength(2)
})

it("słabe zadania i ostatnie dni", async () => {
  show()
  expect(await screen.findByRole("link", { name: "Group Anagrams" })).toHaveAttribute("href", "/sesja?zadanie=7")
  expect(screen.getByText("50%")).toBeInTheDocument()
  expect(screen.getByText("Python · 4 z 8 udanych")).toBeInTheDocument()
  expect(screen.getByText("9 lis · dzisiaj")).toBeInTheDocument()
  expect(screen.getByText("10 powtórek")).toBeInTheDocument()
  expect(screen.getByText("90%")).toBeInTheDocument()
  expect(screen.getByText("8 lis · niedziela")).toBeInTheDocument()
  expect(screen.getByText("0 powtórek")).toBeInTheDocument()
})

it("pusta lista słabych zadań", async () => {
  show("/statystyki", { weak_tasks: [] })
  expect(await screen.findByText("Brak zadań z niską skutecznością.")).toBeInTheDocument()
})

it("stara odpowiedź nie nadpisuje nowego okresu", async () => {       // Etap 6
  let releaseOld: () => void = () => {}
  const json = (body: unknown) => new Response(JSON.stringify(body))
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/stats?from=2026-10-27")) {
      return new Promise<Response>((resolve) => { releaseOld = () => resolve(json({ ...STATS, reviews_count: 9 })) })
    }
    if (url.startsWith("/api/stats")) return json({ ...STATS, reviews_count: 5 })
    return json({ status: "ok", version: "3.0.0" })
  }))
  const { router } = renderApp("/statystyki")
  await act(() => router.navigate("/statystyki?dni=30"))
  expect(await screen.findByText("5")).toBeInTheDocument()
  await act(async () => { releaseOld() })
  await new Promise((r) => setTimeout(r, 20))
  expect(screen.getByText("5")).toBeInTheDocument()
  expect(screen.queryByText("9")).not.toBeInTheDocument()
})
