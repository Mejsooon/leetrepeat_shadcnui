import { importTasks, previewImport, type TaskInput } from "@/api"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const TASK: TaskInput = {
  title: "Suma", language: "python", kind: "function", difficulty: "easy", description: "d",
  starter_code: "", hint: "", solution: "s", tests: [{ input: "f()", expected: "1" }], tags: [],
}

it("previewImport wysyła tekst metodą POST na /api/import/preview", async () => {
  const fetchMock = stubFetch({ items: [] })
  await previewImport("x")
  expect(fetchMock.mock.calls[0][0]).toBe("/api/import/preview")
  expect(fetchMock.mock.calls[0][1].method).toBe("POST")
  expect(fetchMock.mock.calls[0][1].body).toBe('{"text":"x"}')
})

it("importTasks wysyła zadania metodą POST na /api/import", async () => {
  const fetchMock = stubFetch({ imported: 1, skipped: 0, added: [{ title: "Suma", language: "python" }] })
  const result = await importTasks([TASK])
  expect(fetchMock.mock.calls[0][0]).toBe("/api/import")
  expect(fetchMock.mock.calls[0][1].method).toBe("POST")
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tasks: [TASK] })
  expect(result.added).toEqual([{ title: "Suma", language: "python" }])
})
