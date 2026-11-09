import { screen } from "@testing-library/react"
import { EMPTY_LIST, renderApp, stubApi } from "@/test/renderApp"

afterEach(() => {
  vi.unstubAllGlobals()
})

it.each([
  ["/", "Pulpit"],
  ["/zadania", "Twoje zadania"],
  ["/zadania/nowe", "Dodaj zadanie"],
  ["/zadania/5/edycja", "Edytuj zadanie"],
  ["/sesja", "Powtórka"],
  ["/statystyki", "Statystyki"],
  ["/ustawienia", "Ustawienia"],
])("trasa %s pokazuje ekran %s", async (path, heading) => {
  stubApi({ "/api/tasks?": EMPTY_LIST, "/api/tasks": EMPTY_LIST, "/api/health": { status: "ok", version: "3.0.0" },
    "/api/tasks/5": { id: 5, title: "Two Sum", language: "python", kind: "function", difficulty: "easy",
      description: "d", starter_code: "", hint: "", solution: "s", notes: "", tags: [], status: "new",
      tests: [{ input: "f()", expected: "1" }], due_date: "2026-11-09", interval_days: 0,
      created_at: "", updated_at: "", last_reviewed_at: null }, "/api/tags": [] })
  renderApp(path)
  expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument()
})

it("panel pokazuje liczbę zadań z API", async () => {
  stubApi({ "/api/tasks": { ...EMPTY_LIST, counts: { library: 24, due: 0, new: 0 } } })
  renderApp("/")
  expect(await screen.findByText("24")).toBeInTheDocument()
})
