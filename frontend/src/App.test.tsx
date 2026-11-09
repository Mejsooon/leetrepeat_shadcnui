import { screen, waitFor } from "@testing-library/react"
import { EMPTY_LIST, renderApp, stubApi } from "@/test/renderApp"

afterEach(() => {
  vi.unstubAllGlobals()
})

it.each([
  ["/", "Dobry dzień na trochę kodu."],
  ["/zadania", "Twoje zadania"],
  ["/zadania/nowe", "Dodaj zadanie"],
  ["/zadania/5/edycja", "Edytuj zadanie"],
  ["/sesja?zadanie=5", "Two Sum"],
  ["/statystyki", "Zobacz, jak rośniesz."],
  ["/ustawienia", "Ustawienia"],
])("trasa %s pokazuje ekran %s", async (path, heading) => {
  stubApi({ "/api/tasks?": EMPTY_LIST, "/api/tasks": EMPTY_LIST, "/api/health": { status: "ok", version: "3.0.0" },
    "/api/tasks/5": { id: 5, title: "Two Sum", language: "python", kind: "function", difficulty: "easy",
      description: "d", starter_code: "", hint: "", solution: "s", notes: "", tags: [], status: "new",
      tests: [{ input: "f()", expected: "1" }], due_date: "2026-11-09", interval_days: 0,
      created_at: "", updated_at: "", last_reviewed_at: null }, "/api/tags": [],
    "/api/settings/runtimes": { python: { found: true, version: "Python 3.12.3", path: "p" }, dotnet: { found: true, version: "10.0.100", path: "d" } },
    "/api/settings": { values: { python_path: "p", dotnet_path: "d", python_timeout_s: 5, csharp_timeout_s: 20 },
      defaults: { python_path: "p", dotnet_path: "d", python_timeout_s: 5, csharp_timeout_s: 20 },
      database: { path: "/x/leetrepeat.db", task_count: 0, last_backup_at: null } } })
  renderApp(path)
  // waitFor: ekran może się przerysować po wczytaniu danych (np. pusta biblioteka)
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument())
})

it("panel pokazuje liczbę zadań z API", async () => {
  stubApi({ "/api/dashboard": { library_count: 24, streak: 0 }, "/api/tags": [] })
  renderApp("/zadania/nowe")     // test sprawdza tylko panel boczny
  expect(await screen.findByText("24")).toBeInTheDocument()
})
