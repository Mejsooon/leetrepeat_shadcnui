import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderApp } from "@/test/renderApp"

// Monaco nie działa w jsdom — zostaje zapasowe pole tekstowe edytora (z obsługą Ctrl+Enter)
vi.mock("@/components/CodeEditorMonaco", () => new Promise(() => {}))

function task(id: number, title: string, extra: Record<string, unknown> = {}) {
  return {
    id, title, language: "python", kind: "function", difficulty: "easy",
    description: `Treść zadania ${title}.`, starter_code: `# start ${id}`, hint: "Użyj mapy", solution: `# rozwiązanie ${id}`,
    notes: "", tags: ["Tablice"], tests: [{ input: "f()", expected: "1" }],
    status: "new", due_date: "2026-11-09", interval_days: 0, created_at: "", updated_at: "", last_reviewed_at: null,
    ...extra,
  }
}

const TASKS: Record<number, ReturnType<typeof task>> = { 1: task(1, "Two Sum"), 2: task(2, "Valid Parentheses") }
const SESSION = [
  { id: 1, title: "Two Sum", language: "python", difficulty: "easy", tags: ["Tablice"], status: "due" },
  { id: 2, title: "Valid Parentheses", language: "csharp", difficulty: "easy", tags: ["Stos"], status: "new" },
]
const PASS = { results: [{ status: "pass", input: "f()", expected: "1", actual: "1", message: null }], duration_ms: 42 }
export const PREVIEW = [
  { rating: "again", interval_days: 0, due_date: "2026-11-09" },
  { rating: "hard", interval_days: 1, due_date: "2026-11-10" },
  { rating: "good", interval_days: 3, due_date: "2026-11-12" },
  { rating: "easy", interval_days: 7, due_date: "2026-11-16" },
]

type Handler = (url: string, init?: RequestInit) => unknown

// Atrapa fetch dla sesji. overrides: adres → odpowiedź albo funkcja (np. wstrzymana Promise)
function stubSession(overrides: Record<string, unknown | Handler> = {}, session: unknown = SESSION) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    const key = `${method} ${url.split("?")[0]}`
    if (key in overrides) {
      const value = overrides[key]
      const result = typeof value === "function" ? await (value as Handler)(url, init) : value
      return result instanceof Response ? result : json(result)
    }
    if (key === "GET /api/session") return json(session)
    const taskMatch = url.match(/^\/api\/tasks\/(\d+)$/)
    if (method === "GET" && taskMatch) {
      const found = TASKS[Number(taskMatch[1])]
      return found ? json(found) : json({ detail: "Nie znaleziono zadania" }, 404)
    }
    if (url.endsWith("/notes")) return json({ ok: true })
    if (url.endsWith("/review-preview")) return json(PREVIEW)
    if (url.endsWith("/review")) return json({ interval_days: 3, due_date: "2026-11-12" })
    if (key === "POST /api/run") return json(PASS)
    if (url === "/api/health") return json({ status: "ok", version: "3.0.0" })
    return json({ items: [], total: 0, page: 1, pages: 1, counts: { library: 0, due: 0, new: 0 } })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function callsTo(fetchMock: ReturnType<typeof stubSession>, method: string, path: string) {
  return fetchMock.mock.calls.filter((c) => (c[1]?.method ?? "GET") === method && c[0].startsWith(path))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it("pokazuje pierwsze zadanie i licznik", async () => {
  stubSession()
  renderApp("/sesja")
  expect(await screen.findByRole("heading", { name: "Two Sum" })).toBeInTheDocument()
  expect(screen.getByText("Powtórka 1 z 2")).toBeInTheDocument()
  expect(screen.getByText("0 ukończonych · 2 pozostało")).toBeInTheDocument()
  expect(screen.getByText("Treść zadania Two Sum.")).toBeInTheDocument()
  expect(screen.getByLabelText("Twoje rozwiązanie")).toHaveValue("# start 1")
})

it("pusta kolejka", async () => {
  stubSession({}, [])
  renderApp("/sesja")
  expect(await screen.findByText("Brak zadań do powtórki")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Przejdź do zadań" })).toHaveAttribute("href", "/zadania")
})

it("jedno zadanie z ?zadanie=", async () => {
  const fetchMock = stubSession()
  renderApp("/sesja?zadanie=2")
  expect(await screen.findByRole("heading", { name: "Valid Parentheses" })).toBeInTheDocument()
  expect(screen.getByText("Powtórka 1 z 1")).toBeInTheDocument()
  expect(callsTo(fetchMock, "GET", "/api/session")).toHaveLength(0)
})

it("stoper liczy od wczytania", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  stubSession()
  renderApp("/sesja")
  await screen.findByRole("heading", { name: "Two Sum" })
  act(() => vi.advanceTimersByTime(65_000))
  expect(screen.getByText("01:05")).toBeInTheDocument()
})

it("Ctrl+Enter uruchamia testy raz", async () => {                    // Review Focus 3
  let release: () => void = () => {}
  const fetchMock = stubSession({
    "POST /api/run": () => new Promise((resolve) => { release = () => resolve(PASS) }),
  })
  renderApp("/sesja")
  await screen.findByRole("heading", { name: "Two Sum" })
  const user = userEvent.setup()
  await user.keyboard("{Control>}{Enter}{/Control}")
  await user.keyboard("{Control>}{Enter}{/Control}")
  expect(screen.getByRole("button", { name: /Uruchamianie/ })).toBeDisabled()
  expect(callsTo(fetchMock, "POST", "/api/run")).toHaveLength(1)
  act(() => release())
  expect(await screen.findByText("Wszystkie testy przeszły")).toBeInTheDocument()
  const body = JSON.parse(String(callsTo(fetchMock, "POST", "/api/run")[0][1]?.body))
  expect(body).toEqual({ language: "python", kind: "function", code: "# start 1", tests: [{ input: "f()", expected: "1" }] })
})

it("brak Pythona pokazuje alert z linkiem", async () => {
  stubSession({ "POST /api/run": new Response(JSON.stringify({ detail: "Nie znaleziono Pythona: x" }), { status: 503 }) })
  renderApp("/sesja")
  await screen.findByRole("heading", { name: "Two Sum" })
  await userEvent.click(screen.getByRole("button", { name: /Uruchom testy/ }))
  expect(await screen.findByText("Nie znaleziono Pythona: x")).toBeInTheDocument()
  const alert = screen.getByText("Nie znaleziono Pythona: x").closest("[data-slot=alert]") as HTMLElement
  expect(within(alert).getByRole("link", { name: "Ustawienia" })).toHaveAttribute("href", "/ustawienia")
})

it("podpowiedź i rozwiązanie", async () => {
  stubSession()
  renderApp("/sesja")
  await screen.findByRole("heading", { name: "Two Sum" })
  expect(screen.queryByText("Użyj mapy")).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Pokaż podpowiedź" }))
  expect(screen.getByText("Użyj mapy")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Pokaż rozwiązanie" }))
  expect(screen.getByLabelText("Rozwiązanie wzorcowe")).toHaveValue("# rozwiązanie 1")
})

it("notatki zapisują się po 1 s", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const fetchMock = stubSession()
  renderApp("/sesja")
  await screen.findByRole("heading", { name: "Two Sum" })
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Notatki" }))
  fireEvent.change(await screen.findByLabelText("Twoje notatki"), { target: { value: "mapa" } })
  vi.advanceTimersByTime(999)
  expect(callsTo(fetchMock, "PATCH", "/api/tasks/1/notes")).toHaveLength(0)
  await act(async () => { vi.advanceTimersByTime(1) })
  expect(callsTo(fetchMock, "PATCH", "/api/tasks/1/notes")).toHaveLength(1)
  expect(JSON.parse(String(callsTo(fetchMock, "PATCH", "/api/tasks/1/notes")[0][1]?.body))).toEqual({ notes: "mapa" })
})

it("notatka zapisana przy przejściu do oceny", async () => {           // Review Focus 5
  const fetchMock = stubSession()
  renderApp("/sesja")
  await screen.findByRole("heading", { name: "Two Sum" })
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Notatki" }))
  fireEvent.change(await screen.findByLabelText("Twoje notatki"), { target: { value: "szybko" } })
  fireEvent.click(screen.getByRole("button", { name: "Przejdź do oceny" }))
  await waitFor(() => expect(callsTo(fetchMock, "PATCH", "/api/tasks/1/notes")).toHaveLength(1))
})
