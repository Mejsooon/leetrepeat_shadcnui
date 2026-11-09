import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { AppSidebar } from "@/components/AppSidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { ThemeProvider } from "@/theme"
import { mockMatchMedia } from "@/test/matchMedia"

function renderSidebar(path: string, props: { taskCount?: number; streak?: number } = {}) {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <SidebarProvider>
          <AppSidebar {...props} />
        </SidebarProvider>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
  mockMatchMedia(false)
})

it("zaznacza Zadania jako aktywne na /zadania/3/edycja", () => {
  renderSidebar("/zadania/3/edycja")
  expect(screen.getByRole("link", { name: /Zadania/ })).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("link", { name: /Pulpit/ })).not.toHaveAttribute("aria-current")
})

it("licznik zadań widoczny tylko gdy taskCount podany", () => {
  renderSidebar("/")
  expect(screen.queryByText("24")).not.toBeInTheDocument()
})

it("licznik zadań pokazuje podaną liczbę", () => {
  renderSidebar("/", { taskCount: 24 })
  expect(screen.getByText("24")).toBeInTheDocument()
})

it("karta serii widoczna tylko gdy streak podany", () => {
  renderSidebar("/", { streak: 12 })
  expect(screen.getByText("Twoja seria trwa już 12 dni.")).toBeInTheDocument()
})

it("klik w 'Motyw ciemny' ustawia klasę dark", async () => {
  renderSidebar("/")
  await userEvent.click(screen.getByRole("radio", { name: "Motyw ciemny" }))
  expect(document.documentElement).toHaveClass("dark")
  expect(screen.getByRole("radio", { name: "Motyw ciemny" })).toHaveAttribute("aria-checked", "true")
})
