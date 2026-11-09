import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AppRoutes } from "@/App"
import { mockMatchMedia } from "@/test/matchMedia"
import { ThemeProvider } from "@/theme"

function renderAt(path: string) {
  mockMatchMedia(false)
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

it.each([
  ["/", "Pulpit"],
  ["/zadania", "Twoje zadania"],
  ["/zadania/nowe", "Dodaj zadanie"],
  ["/zadania/5/edycja", "Edytuj zadanie"],
  ["/sesja", "Powtórka"],
  ["/statystyki", "Statystyki"],
  ["/ustawienia", "Ustawienia"],
])("trasa %s pokazuje ekran %s", (path, heading) => {
  renderAt(path)
  expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument()
})
