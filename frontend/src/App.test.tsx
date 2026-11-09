import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AppRoutes } from "@/App"

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
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
