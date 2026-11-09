import { act, screen, waitFor } from "@testing-library/react"
import { renderApp, EMPTY_LIST } from "@/test/renderApp"

// Odpowiedź /api/dashboard zmieniana w trakcie testu (np. po zakończonej sesji)
function stubDashboard(state: { streak: number; library_count: number }) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith("/api/dashboard")) {
      return new Response(JSON.stringify({
        due_count: 0, due_by_language: { python: 0, csharp: 0 }, new_count: 0, streak: state.streak, longest_streak: state.streak,
        library_count: state.library_count, library_by_language: { python: 0, csharp: 0 }, queue: [], queue_rest: [], session_count: 0,
        progress_by_language: [], next_review_date: null, completed_today: 0,
      }))
    }
    if (url === "/api/health") return new Response(JSON.stringify({ status: "ok", version: "3.0.0" }))
    if (url.startsWith("/api/tags")) return new Response("[]")
    return new Response(JSON.stringify(EMPTY_LIST))
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

it("seria i licznik odświeżają się po zmianie ekranu", async () => {   // Review Focus 4
  const state = { streak: 2, library_count: 5 }
  const fetchMock = stubDashboard(state)
  const { router } = renderApp("/zadania")
  expect(await screen.findByText("Twoja seria trwa już 2 dni.")).toBeInTheDocument()
  state.streak = 3
  await act(() => router.navigate("/zadania/nowe"))
  expect(await screen.findByText("Twoja seria trwa już 3 dni.")).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/dashboard").length).toBeGreaterThanOrEqual(2)
})

it("seria 1 dzień i ukrycie przy 0", async () => {
  const state = { streak: 1, library_count: 5 }
  stubDashboard(state)
  const { router } = renderApp("/zadania/nowe")
  expect(await screen.findByText("Twoja seria trwa już 1 dzień.")).toBeInTheDocument()
  state.streak = 0
  await act(() => router.navigate("/zadania"))
  await waitFor(() => expect(screen.queryByText(/Twoja seria/)).not.toBeInTheDocument())
})
