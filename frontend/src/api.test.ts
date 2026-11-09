import { ApiError, getHealth, request } from "@/api"

afterEach(() => {
  vi.unstubAllGlobals()
})

it("request zwraca JSON przy 200", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  await expect(request("/cos")).resolves.toEqual({ a: 1 })
  expect(fetchMock.mock.calls[0][0]).toBe("/api/cos")
})

it("request rzuca ApiError(404, detail) przy 404", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: "Nie ma zadania" }), { status: 404 })))
  const error = await request("/tasks/9").catch((e: ApiError) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(404)
  expect(error.message).toBe("Nie ma zadania")
})

it("request rzuca ApiError(0) gdy fetch odrzuca", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
  const error = await request("/health").catch((e: ApiError) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(0)
  expect(error.message).toBe("Brak połączenia")
})

it("getHealth woła /api/health", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", version: "3.0.0" }), { status: 200 })))
  await expect(getHealth()).resolves.toEqual({ status: "ok", version: "3.0.0" })
})
