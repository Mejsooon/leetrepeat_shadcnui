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

it("równoczesne getDashboard to jedno żądanie", async () => {          // Etap 6: AppLayout i Pulpit naraz
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ streak: 3 })))
  vi.stubGlobal("fetch", fetchMock)
  const [a, b] = await Promise.all([getDashboard(), getDashboard()])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(a).toEqual({ streak: 3 })
  expect(b).toEqual({ streak: 3 })
  await getDashboard()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
