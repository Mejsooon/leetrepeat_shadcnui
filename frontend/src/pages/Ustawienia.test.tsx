import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderApp } from "@/test/renderApp"
import { mockMatchMedia } from "@/test/matchMedia"

const VALUES = { python_path: "/usr/bin/python3", dotnet_path: "dotnet", python_timeout_s: 5, csharp_timeout_s: 20 }
const SETTINGS = {
  values: VALUES,
  defaults: VALUES,
  database: { path: "/home/m/leetrepeat/leetrepeat.db", task_count: 24, last_backup_at: null },
}
const RUNTIMES = {
  python: { found: true, version: "Python 3.12.3", path: "/usr/bin/python3" },
  dotnet: { found: false, version: null, path: "dotnet" },
}

type Overrides = { settings?: unknown; runtimes?: unknown; restore?: Response }

// Atrapa API Ustawień; PUT odsyła zapisane wartości
function stubSettings(overrides: Overrides = {}) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  let current = (overrides.settings ?? SETTINGS) as typeof SETTINGS
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/settings" && method === "PUT") {
      current = { ...current, values: JSON.parse(String(init?.body)) }
      return json(current)
    }
    if (url === "/api/settings") return json(current)
    if (url === "/api/settings/runtimes") return json(overrides.runtimes ?? RUNTIMES)
    if (url === "/api/backup/restore") return overrides.restore ?? json({ tasks: 3, backup_path: "/home/m/leetrepeat/leetrepeat.db.przed-przywroceniem-20261109-120000.db" })
    if (url === "/api/health") return json({ status: "ok", version: "3.0.0" })
    return json({ library_count: 24, streak: 0 })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function calls(fetchMock: ReturnType<typeof stubSettings>, method: string, url: string) {
  return fetchMock.mock.calls.filter((c) => (c[1]?.method ?? "GET") === method && c[0] === url)
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
  mockMatchMedia(false)
})
afterEach(() => vi.unstubAllGlobals())

it("motyw zmienia się od razu", async () => {
  stubSettings()
  renderApp("/ustawienia")
  await userEvent.click(await screen.findByRole("radio", { name: /Ciemny/ }))
  expect(document.documentElement).toHaveClass("dark")
  expect(localStorage.getItem("leetrepeat-theme")).toBe("dark")
})

it("pokazuje wykryte środowisko", async () => {
  stubSettings()
  renderApp("/ustawienia")
  expect(await screen.findByText("Python 3.12.3")).toBeInTheDocument()
  expect(screen.getByText("Wykryto")).toBeInTheDocument()
  expect(screen.getByText("Nie wykryto")).toBeInTheDocument()
  expect(screen.getByText(/Zadania w tym języku są niedostępne/)).toBeInTheDocument()
})

it("zapis ścieżki i limitu", async () => {
  const fetchMock = stubSettings()
  renderApp("/ustawienia")
  const limit = await screen.findByLabelText("Limit czasu Pythona")
  fireEvent.change(limit, { target: { value: "7" } })
  expect(screen.getByText("Zmiany niezapisane")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Zapisz" }))
  await waitFor(() => expect(calls(fetchMock, "PUT", "/api/settings")).toHaveLength(1))
  expect(JSON.parse(String(calls(fetchMock, "PUT", "/api/settings")[0][1]?.body))).toEqual({ ...VALUES, python_timeout_s: 7 })
  await waitFor(() => expect(screen.queryByText("Zmiany niezapisane")).not.toBeInTheDocument())
  expect(screen.getByText("Zapisano lokalnie")).toBeInTheDocument()
})

it("walidacja limitu i ścieżki", async () => {                          // Review Focus 3
  stubSettings()
  renderApp("/ustawienia")
  fireEvent.change(await screen.findByLabelText("Limit czasu Pythona"), { target: { value: "0" } })
  expect(screen.getByText("Limit musi być od 1 do 300 sekund")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Zapisz" })).toBeDisabled()
  fireEvent.change(screen.getByLabelText("Limit czasu Pythona"), { target: { value: "5" } })
  fireEvent.change(screen.getByLabelText("Ścieżka do Pythona"), { target: { value: "" } })
  expect(screen.getByText("Pole nie może być puste")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Zapisz" })).toBeDisabled()
})

it("przywróć domyślne", async () => {
  const fetchMock = stubSettings({ settings: { ...SETTINGS, values: { ...VALUES, python_timeout_s: 9 } } })
  renderApp("/ustawienia")
  expect(await screen.findByLabelText("Limit czasu Pythona")).toHaveValue(9)
  await userEvent.click(screen.getByRole("button", { name: "Przywróć domyślne" }))
  expect(screen.getByLabelText("Limit czasu Pythona")).toHaveValue(5)
  expect(screen.getByRole("button", { name: "Zapisz" })).toBeEnabled()
  expect(calls(fetchMock, "PUT", "/api/settings")).toHaveLength(0)
})

it("sprawdź ponownie", async () => {
  const fetchMock = stubSettings()
  renderApp("/ustawienia")
  await screen.findByText("Python 3.12.3")
  await userEvent.click(screen.getByRole("button", { name: /Sprawdź ponownie/ }))
  await waitFor(() => expect(calls(fetchMock, "GET", "/api/settings/runtimes")).toHaveLength(2))
})

it("zapis bez zmian jest nieaktywny", async () => {
  stubSettings()
  renderApp("/ustawienia")
  await screen.findByLabelText("Limit czasu Pythona")
  expect(screen.getByRole("button", { name: "Zapisz" })).toBeDisabled()
})
