import { getDashboard, getStats } from "@/api"

afterEach(() => vi.unstubAllGlobals())

it("getDashboard i getStats wołają właściwe adresy", async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  await getDashboard()
  await getStats("2026-11-01", "2026-11-14")
  expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard")
  expect(fetchMock.mock.calls[1][0]).toBe("/api/stats?from=2026-11-01&to=2026-11-14")
})
