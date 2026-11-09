import { deleteTask, listTasks } from "@/api"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(body), { status }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

it("listTasks buduje adres tylko z niepustych filtrów", async () => {
  const fetchMock = stubFetch({ items: [], total: 0, page: 2, pages: 1, counts: { library: 0, due: 0, new: 0 } })
  await listTasks({ q: "ab", language: "python", page: 2 })
  expect(fetchMock.mock.calls[0][0]).toBe("/api/tasks?q=ab&language=python&page=2")
})

it("listTasks bez filtrów woła /api/tasks", async () => {
  const fetchMock = stubFetch({ items: [], total: 0, page: 1, pages: 1, counts: { library: 0, due: 0, new: 0 } })
  await listTasks({ q: "" })
  expect(fetchMock.mock.calls[0][0]).toBe("/api/tasks")
})

it("deleteTask używa DELETE i zwraca null przy 204", async () => {
  const fetchMock = stubFetch(null, 204)
  await expect(deleteTask(3)).resolves.toBeNull()
  expect(fetchMock.mock.calls[0][0]).toBe("/api/tasks/3")
  expect(fetchMock.mock.calls[0][1].method).toBe("DELETE")
})
