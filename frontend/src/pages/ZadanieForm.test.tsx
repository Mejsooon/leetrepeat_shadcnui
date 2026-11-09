import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EMPTY_LIST, renderApp, stubApi } from "@/test/renderApp"

// Monaco nie działa w jsdom — edytor kodu zastępuje zwykłe pole tekstowe
vi.mock("@/components/CodeEditor", () => ({
  CodeEditor: (props: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
    <textarea aria-label={props.ariaLabel} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  ),
}))

const TASK = {
  id: 5, title: "Two Sum", language: "python", kind: "function", difficulty: "easy",
  description: "Zwróć indeksy.", starter_code: "", hint: "Mapa", solution: "def two_sum(n, t): pass",
  notes: "", tags: ["Tablice"], tests: [{ input: "two_sum([2,7], 9)", expected: "[0,1]" }],
  status: "new", due_date: "2026-11-09", interval_days: 0, created_at: "", updated_at: "", last_reviewed_at: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function calls(fetchMock: ReturnType<typeof stubApi>, method: string) {
  return fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === method)
}

async function fillValidTask(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tytuł zadania"), "Odwracanie listy")
  await user.type(screen.getByLabelText("Treść zadania"), "Odwróć listę.")
  // „[[” = dosłowny „[” w składni user-event
  await user.type(screen.getByLabelText("Wywołanie – test 1"), "odwroc([[1,2])")
  await user.type(screen.getByLabelText("Oczekiwany wynik (JSON) – test 1"), "[[2,1]")
  await user.type(screen.getByLabelText("Rozwiązanie"), "def odwroc(l): return l[[::-1]")
}

it("zapisuje nowe zadanie i wraca do listy", async () => {
  const user = userEvent.setup()
  const fetchMock = stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [{ name: "Listy", count: 2 }] })
  const { router } = renderApp("/zadania/nowe")
  await screen.findByRole("heading", { level: 1, name: "Dodaj zadanie" })
  await fillValidTask(user)
  await user.type(screen.getByLabelText("Dodaj tag"), "Listy{Enter}")
  await user.click(screen.getByRole("button", { name: /Zapisz zadanie/ }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/zadania"))
  const body = JSON.parse(calls(fetchMock, "POST")[0][1]!.body as string)
  expect(body).toMatchObject({
    title: "Odwracanie listy", language: "python", kind: "function", difficulty: "easy",
    description: "Odwróć listę.", tags: ["Listy"], tests: [{ input: "odwroc([1,2])", expected: "[2,1]" }],
  })
})

it("pusty tytuł blokuje zapis z komunikatem", async () => {          // Review Focus 4
  const user = userEvent.setup()
  const fetchMock = stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/nowe")
  await screen.findByRole("heading", { level: 1, name: "Dodaj zadanie" })
  await fillValidTask(user)
  await user.clear(screen.getByLabelText("Tytuł zadania"))
  await user.type(screen.getByLabelText("Tytuł zadania"), "   ")
  expect(screen.getByText("Pole nie może być puste")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: /Zapisz zadanie/ }))
  expect(calls(fetchMock, "POST")).toHaveLength(0)
})

it("typ Program zmienia etykiety testów", async () => {
  const user = userEvent.setup()
  stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/nowe")
  await screen.findByLabelText("Wywołanie – test 1")
  await user.click(screen.getByRole("radio", { name: "Program (wejście/wyjście)" }))
  expect(screen.getByLabelText("Wejście (stdin) – test 1")).toBeInTheDocument()
  expect(screen.getByLabelText("Oczekiwane wyjście – test 1")).toBeInTheDocument()
})

it("tag dodawany Enterem, podpowiedź z listy, usuwany ×", async () => {
  const user = userEvent.setup()
  stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [{ name: "Tablice", count: 3 }] })
  renderApp("/zadania/nowe")
  const tagInput = await screen.findByLabelText("Dodaj tag")
  await user.type(tagInput, "Stos{Enter}")
  expect(screen.getByText("Stos")).toBeInTheDocument()
  await user.type(tagInput, "tab")
  await user.click(await screen.findByRole("option", { name: "Tablice" }))
  expect(screen.getByRole("button", { name: "Usuń tag Tablice" })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Usuń tag Stos" }))
  expect(screen.queryByRole("button", { name: "Usuń tag Stos" })).not.toBeInTheDocument()
})

it("Podgląd renderuje Markdown", async () => {
  const user = userEvent.setup()
  stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/nowe")
  await user.type(await screen.findByLabelText("Treść zadania"), "**gruby**")
  await user.click(screen.getByRole("button", { name: "Podgląd" }))
  expect(screen.getByText("gruby").tagName).toBe("STRONG")
})

it("edycja wczytuje zadanie i wysyła PUT", async () => {
  const user = userEvent.setup()
  const fetchMock = stubApi({ "/api/tasks/5": TASK, "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania/5/edycja")
  expect(await screen.findByDisplayValue("Two Sum")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Usuń tag Tablice" })).toBeInTheDocument()
  await user.type(screen.getByLabelText("Tytuł zadania"), " 2")
  await user.click(screen.getByRole("button", { name: /Zapisz zmiany/ }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/zadania"))
  const put = calls(fetchMock, "PUT")[0]
  expect(put[0]).toBe("/api/tasks/5")
  expect(JSON.parse(put[1]!.body as string).title).toBe("Two Sum 2")
})

it("edycja nieistniejącego zadania pokazuje komunikat", async () => {
  stubApi({ "/api/tasks?": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/9/edycja")
  expect(await screen.findByText("Nie znaleziono zadania")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Wróć do listy zadań/ })).toHaveAttribute("href", "/zadania")
})

it("usunięcie po potwierdzeniu woła DELETE i wraca do listy", async () => {
  const user = userEvent.setup()
  const fetchMock = stubApi({ "/api/tasks/5": TASK, "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania/5/edycja")
  await screen.findByDisplayValue("Two Sum")
  await user.click(screen.getByRole("button", { name: /Usuń zadanie/ }))
  expect(await screen.findByText(/Usunąć zadanie „Two Sum”\?/)).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Usuń" }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/zadania"))
  expect(calls(fetchMock, "DELETE")[0][0]).toBe("/api/tasks/5")
})

it("opuszczenie z niezapisanymi zmianami pyta o potwierdzenie", async () => {   // Review Focus 3
  const user = userEvent.setup()
  stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania/nowe")
  await user.type(await screen.findByLabelText("Tytuł zadania"), "Coś")
  expect(screen.getByText("Zmiany niezapisane")).toBeInTheDocument()
  await user.click(screen.getByRole("link", { name: /Pulpit/ }))
  expect(await screen.findByText("Opuścić stronę?")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Zostań" }))
  expect(router.state.location.pathname).toBe("/zadania/nowe")
  await user.click(screen.getByRole("link", { name: /Pulpit/ }))
  await user.click(await screen.findByRole("button", { name: "Opuść" }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/"))
})

it("po zapisie nie ma pytania o opuszczenie", async () => {
  const user = userEvent.setup()
  stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  const { router } = renderApp("/zadania/nowe")
  await screen.findByLabelText("Tytuł zadania")
  await fillValidTask(user)
  await user.click(screen.getByRole("button", { name: /Zapisz zadanie/ }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/zadania"))
  expect(screen.queryByText("Opuścić stronę?")).not.toBeInTheDocument()
})

it("liczba testów jest odmieniona", async () => {
  const tests = Array.from({ length: 5 }, (_, i) => ({ input: `f(${i})`, expected: "1" }))
  stubApi({ "/api/tasks/5": { ...TASK, tests }, "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/5/edycja")
  expect(await screen.findByText("5 przypadków")).toBeInTheDocument()
})

it("kliknięcie Zapisz przy błędach pokazuje komunikaty przy polach", async () => {   // przegląd: Important 1
  const user = userEvent.setup()
  const fetchMock = stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/nowe")
  await user.type(await screen.findByLabelText("Tytuł zadania"), "Coś")
  await user.click(screen.getByRole("button", { name: /Zapisz zadanie/ }))
  expect(screen.getAllByText("Pole nie może być puste").length).toBe(2)          // treść i rozwiązanie
  expect(screen.getByText("Wywołanie funkcji nie może być puste")).toBeInTheDocument()
  expect(calls(fetchMock, "POST")).toHaveLength(0)
})

it("błąd wczytywania (np. 500) nie pokazuje pustego formularza", async () => {     // przegląd: Important 2
  stubApi({ "/api/tasks/5": new Response("Internal Server Error", { status: 500 }), "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/5/edycja")
  expect(await screen.findByText("Nie udało się wczytać zadania")).toBeInTheDocument()
  expect(screen.queryByLabelText("Tytuł zadania")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Zapisz zmiany/ })).not.toBeInTheDocument()
})

it("tag wpisany bez Entera jest dodany po opuszczeniu pola", async () => {        // przegląd: Minor 3 → Important
  const user = userEvent.setup()
  const fetchMock = stubApi({ "/api/tasks": EMPTY_LIST, "/api/tags": [] })
  renderApp("/zadania/nowe")
  await screen.findByLabelText("Tytuł zadania")
  await fillValidTask(user)
  await user.type(screen.getByLabelText("Dodaj tag"), "Stos")
  await user.click(screen.getByRole("button", { name: /Zapisz zadanie/ }))
  await waitFor(() => expect(calls(fetchMock, "POST")).toHaveLength(1))
  expect(JSON.parse(calls(fetchMock, "POST")[0][1]!.body as string).tags).toEqual(["Stos"])
})
