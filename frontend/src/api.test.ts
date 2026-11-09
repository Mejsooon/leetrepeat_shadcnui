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
  const error = (await request("/tasks/9").catch((e) => e)) as ApiError
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(404)
  expect(error.message).toBe("Nie ma zadania")
})

it("request rzuca ApiError(0) gdy fetch odrzuca", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
  const error = (await request("/health").catch((e) => e)) as ApiError
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(0)
  expect(error.message).toBe("Brak połączenia")
})

it("getHealth woła /api/health", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: "ok", version: "3.0.0" }), { status: 200 })))
  await expect(getHealth()).resolves.toEqual({ status: "ok", version: "3.0.0" })
})

it("request rzuca ApiError(500) gdy odpowiedź błędu nie jest JSON-em", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain" } })))
  const error = (await request("/tasks").catch((e) => e)) as ApiError
  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(500)
  expect(error.message).toBe("Błąd 500")
})

it("detail jako lista daje pierwszy komunikat", async () => {        // Etap 6: zapas na stary format 422
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: [{ msg: "Pole nie może być puste" }] }), { status: 422 })))
  const error = (await request("/tasks").catch((e) => e)) as ApiError
  expect(error.message).toBe("Pole nie może być puste")
})
