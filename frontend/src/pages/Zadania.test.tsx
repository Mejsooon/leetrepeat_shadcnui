import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EMPTY_LIST, renderApp, stubApi } from "@/test/renderApp"

const TODAY = new Date().toISOString().slice(0, 10)

const LIST = {
  items: [
    { id: 1, title: "Two Sum", tags: ["Tablice", "Mapa haszująca"], language: "python", difficulty: "easy",
      due_date: TODAY, status: "due" },
    { id: 2, title: "Merge Intervals", tags: [], language: "csharp", difficulty: "medium",
      due_date: "2026-11-25", status: "learning" },
  ],
  total: 24, page: 1, pages: 3, counts: { library: 24, due: 6, new: 3 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function urls(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith("/api/tasks"))
}

it("pokazuje wiersze z etykietami po polsku", async () => {
  stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  renderApp("/zadania")
  expect(await screen.findByText("Two Sum")).toBeInTheDocument()
  expect(screen.getByText("Tablice · Mapa haszująca")).toBeInTheDocument()
  expect(screen.getAllByText("Python").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Łatwe").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Do powtórki").length).toBeGreaterThan(0)
  expect(screen.getByText("Dzisiaj")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Two Sum" })).toHaveAttribute("href", "/sesja?zadanie=1")
  expect(screen.getByRole("link", { name: "Edytuj Two Sum" })).toHaveAttribute("href", "/zadania/1/edycja")
})

it("podtytuł z licznikami i odmianą", async () => {
  stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  renderApp("/zadania")
  expect(await screen.findByText("24 zadania · 6 do powtórki dziś · 3 nowe")).toBeInTheDocument()
})

it("podtytuł: 5 zadań i 1 zadanie", async () => {
  stubApi({ "/api/tasks": { ...LIST, counts: { library: 5, due: 1, new: 0 } }, "/api/tags": [] })
  renderApp("/zadania")
  expect(await screen.findByText("5 zadań · 1 do powtórki dziś · 0 nowych")).toBeInTheDocument()
})

it("pusta biblioteka pokazuje pierwsze kroki", async () => {
  stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania")
  expect(await screen.findByRole("link", { name: "Dodaj pierwsze zadanie" })).toHaveAttribute("href", "/zadania/nowe")
  expect(screen.getByText("Twój kod. Twoje tempo.")).toBeInTheDocument()
})

it("brak wyników filtrów pokazuje 'Wyczyść filtry'", async () => {
  stubApi({ "/api/tasks": { ...EMPTY_LIST, counts: { library: 24, due: 0, new: 0 } }, "/api/tags": [] })
  const { router } = renderApp("/zadania?q=xyz")
  expect(await screen.findByText("Brak zadań dla tych filtrów")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }))
  await waitFor(() => expect(router.state.location.search).toBe(""))
})

it("wpisanie szukanej frazy woła API z q po 300 ms", async () => {
  const fetchMock = stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  renderApp("/zadania")
  await screen.findByText("Two Sum")
  vi.useFakeTimers()
  fireEvent.change(screen.getByRole("searchbox", { name: "Szukaj zadań" }), { target: { value: "two" } })
  expect(urls(fetchMock).some((u) => u.includes("q=two"))).toBe(false)
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  vi.useRealTimers()
  await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("q=two"))).toBe(true))
})

it("Ctrl+K ustawia fokus na wyszukiwarce", async () => {
  stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  renderApp("/zadania")
  await screen.findByText("Two Sum")
  await userEvent.keyboard("{Control>}k{/Control}")
  expect(screen.getByRole("searchbox", { name: "Szukaj zadań" })).toHaveFocus()
})

it("strona spoza zakresu przeskakuje na ostatnią", async () => {   // Review Focus 2
  const fetchMock = stubApi({ "/api/tasks?page=5": { ...EMPTY_LIST, total: 12, pages: 2, page: 5,
    counts: { library: 12, due: 0, new: 0 } }, "/api/tasks": LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania?page=5")
  await waitFor(() => expect(router.state.location.search).toBe("?page=2"))
  await waitFor(() => expect(urls(fetchMock).some((u) => u.includes("page=2"))).toBe(true))
  expect(screen.queryByText("Brak zadań dla tych filtrów")).not.toBeInTheDocument()
})

it("Następna zmienia stronę w adresie", async () => {
  stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania")
  await screen.findByText("Two Sum")
  expect(screen.getByText("1–10 z 24 zadań")).toBeInTheDocument()
  expect(screen.getByText("Strona 1 z 3")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Poprzednia/ })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: /Następna/ }))
  await waitFor(() => expect(router.state.location.search).toBe("?page=2"))
})

it("wyszukiwarka czyści się, gdy adres traci filtr q", async () => {             // przegląd: Minor 9 → Important
  stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania?q=two")
  expect(await screen.findByRole("searchbox", { name: "Szukaj zadań" })).toHaveValue("two")
  await act(async () => {
    await router.navigate("/zadania")
  })
  await waitFor(() => expect(screen.getByRole("searchbox", { name: "Szukaj zadań" })).toHaveValue(""))
})

// --- Etap 5: brak środowiska ---

it("plakietka Niedostępne przy zadaniach C# bez .NET", async () => {
  stubApi({
    "/api/tasks": LIST, "/api/tags": [],
    "/api/settings/runtimes": {
      python: { found: true, version: "Python 3.12.3", path: "/usr/bin/python3" },
      dotnet: { found: false, version: null, path: "dotnet" },
    },
  })
  renderApp("/zadania")
  const badge = await screen.findByRole("link", { name: "Niedostępne" })
  expect(badge).toHaveAttribute("href", "/ustawienia")
  expect(badge.closest("tr")).toHaveTextContent("Merge Intervals")
  expect(screen.getAllByRole("link", { name: "Niedostępne" })).toHaveLength(1)
})

it("błąd runtimes nie psuje listy", async () => {
  stubApi({ "/api/tasks": LIST, "/api/tags": [], "/api/settings/runtimes": new Response("boom", { status: 500 }) })
  renderApp("/zadania")
  expect(await screen.findByText("Merge Intervals")).toBeInTheDocument()
  expect(screen.queryByText("Niedostępne")).not.toBeInTheDocument()
})

it("zła strona w adresie wraca do 1", async () => {                   // Etap 6
  const fetchMock = stubApi({ "/api/tasks": LIST, "/api/tags": [] })
  renderApp("/zadania?page=abc")
  expect(await screen.findByText("Merge Intervals")).toBeInTheDocument()
  const listCalls = fetchMock.mock.calls.map((c) => c[0]).filter((u) => u.startsWith("/api/tasks?"))
  expect(listCalls.every((u) => u.includes("page=1"))).toBe(true)
})
