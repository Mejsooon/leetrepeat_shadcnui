import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConnectionBanner } from "@/components/ConnectionBanner"

afterEach(() => {
  vi.unstubAllGlobals()
})

const ok = () => new Response(JSON.stringify({ status: "ok", version: "3.0.0" }), { status: 200 })

it("baner pojawia się, gdy health się nie udaje, i znika po 'Spróbuj ponownie' z sukcesem", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok())
  vi.stubGlobal("fetch", fetchMock)
  render(<ConnectionBanner />)
  expect(await screen.findByText("Nie można połączyć się z aplikacją")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }))
  await vi.waitFor(() => expect(screen.queryByText("Nie można połączyć się z aplikacją")).not.toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it("baner nie pojawia się, gdy health zwraca ok", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok())
  vi.stubGlobal("fetch", fetchMock)
  render(<ConnectionBanner />)
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  expect(screen.queryByText("Nie można połączyć się z aplikacją")).not.toBeInTheDocument()
})

it("502 z serwera deweloperskiego pokazuje baner", async () => {     // Etap 6: Vite proxy, backend wyłączony
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })))
  render(<ConnectionBanner />)
  expect(await screen.findByText("Nie można połączyć się z aplikacją")).toBeInTheDocument()
})
