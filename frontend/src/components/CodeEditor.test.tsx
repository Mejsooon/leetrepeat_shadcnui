import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { CodeEditor } from "@/components/CodeEditor"
import { mockMatchMedia } from "@/test/matchMedia"
import { ThemeProvider } from "@/theme"

// Monaco nie działa w jsdom — import zostaje „w trakcie wczytywania”, widoczny jest zapasowy textarea
vi.mock("@/components/CodeEditorMonaco", () => new Promise(() => {}))

function Harness({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState("def f():\n")
  return (
    <CodeEditor
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
      language="python"
      fileName="two_sum.py"
      ariaLabel="Rozwiązanie"
    />
  )
}

it("pokazuje pasek pliku i zapasowe pole z wartością", () => {
  mockMatchMedia(false)
  render(
    <ThemeProvider>
      <Harness onChange={() => {}} />
    </ThemeProvider>,
  )
  expect(screen.getByText("two_sum.py")).toBeInTheDocument()
  expect(screen.getByText("Python 3.12 · UTF-8")).toBeInTheDocument()
  expect(screen.getByLabelText("Rozwiązanie")).toHaveValue("def f():\n")
})

it("pisanie w zapasowym polu wywołuje onChange", async () => {
  mockMatchMedia(false)
  const onChange = vi.fn()
  render(
    <ThemeProvider>
      <Harness onChange={onChange} />
    </ThemeProvider>,
  )
  await userEvent.type(screen.getByLabelText("Rozwiązanie"), "x")
  expect(onChange).toHaveBeenLastCalledWith("def f():\nx")
})
