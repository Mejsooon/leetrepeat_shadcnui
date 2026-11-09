import { screen, waitFor } from "@testing-library/react"
import { renderApp } from "@/test/renderApp"

// Monaco zgłasza zmianę kodu i skrót Ctrl+Enter poza zdarzeniami Reacta — jedno po drugim,
// zanim React zdąży przerysować ekran. Atrapa edytora robi dokładnie to samo w jednym kroku.
vi.mock("@/components/CodeEditor", () => ({
  CodeEditor: (props: { ariaLabel: string; onChange: (v: string) => void; onCtrlEnter?: () => void }) => (
    <button
      type="button"
      onClick={() => {
        props.onChange("def f():\n    return 1")
        props.onCtrlEnter?.()
      }}
    >
      {`wpisz i uruchom: ${props.ariaLabel}`}
    </button>
  ),
}))

const TASK = {
  id: 1, title: "Two Sum", language: "python", kind: "function", difficulty: "easy",
  description: "Treść.", starter_code: "# start", hint: "", solution: "# r", notes: "", tags: [],
  tests: [{ input: "f()", expected: "1" }], status: "new", due_date: "2026-11-09", interval_days: 0,
  created_at: "", updated_at: "", last_reviewed_at: null,
}

afterEach(() => vi.unstubAllGlobals())

it("Ctrl+Enter tuż po zmianie kodu wysyła nowy kod, nie stary", async () => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/tasks/1") return new Response(JSON.stringify(TASK))
    if (url === "/api/run") {
      return new Response(JSON.stringify({ results: [{ status: "pass", input: "f()", expected: "1", actual: "1", message: null }], duration_ms: 1 }))
    }
    return new Response(JSON.stringify({ items: [], total: 0, page: 1, pages: 1, counts: { library: 0, due: 0, new: 0 } }))
  })
  vi.stubGlobal("fetch", fetchMock)
  renderApp("/sesja?zadanie=1")
  await screen.findByRole("heading", { name: "Two Sum" })
  // Zdarzenie spoza Reacta (jak z Monaco): dispatch bez fireEvent-owego act wokół React
  screen.getByRole("button", { name: "wpisz i uruchom: Twoje rozwiązanie" }).dispatchEvent(new MouseEvent("click", { bubbles: true }))
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/api/run")).toBe(true))
  const call = fetchMock.mock.calls.find((c) => c[0] === "/api/run")!
  expect(JSON.parse(String(call[1]?.body)).code).toBe("def f():\n    return 1")
})
