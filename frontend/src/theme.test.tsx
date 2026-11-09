import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider, useTheme } from "@/theme"
import { mockMatchMedia } from "@/test/matchMedia"

function Probe() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("light")}>jasny</button>
      <button onClick={() => setTheme("dark")}>ciemny</button>
    </div>
  )
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
})

it("domyślnie systemowy: ciemny system → klasa dark", () => {
  mockMatchMedia(true)
  renderTheme()
  expect(screen.getByTestId("theme")).toHaveTextContent("system")
  expect(document.documentElement).toHaveClass("dark")
})

it("wybór 'light' zapisuje się i zdejmuje dark", async () => {
  mockMatchMedia(true)
  renderTheme()
  await userEvent.click(screen.getByText("jasny"))
  expect(localStorage.getItem("leetrepeat-theme")).toBe("light")
  expect(document.documentElement).not.toHaveClass("dark")
})

it("zapisany 'dark' jest przywracany po ponownym renderze", () => {
  mockMatchMedia(false)
  localStorage.setItem("leetrepeat-theme", "dark")
  renderTheme()
  expect(screen.getByTestId("theme")).toHaveTextContent("dark")
  expect(document.documentElement).toHaveClass("dark")
})

it("tryb systemowy reaguje na zmianę motywu systemu", () => {
  const media = mockMatchMedia(false)
  renderTheme()
  expect(document.documentElement).not.toHaveClass("dark")
  act(() => media.setSystemDark(true))
  expect(document.documentElement).toHaveClass("dark")
})

it("brak dostępu do localStorage nie wywraca aplikacji", () => {
  mockMatchMedia(false)
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("zablokowane")
  })
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("zablokowane")
  })
  renderTheme()
  expect(screen.getByTestId("theme")).toHaveTextContent("system")
  get.mockRestore()
  set.mockRestore()
})
