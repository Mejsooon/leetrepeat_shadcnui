import { getReviewPreview, getSession, runTests, submitReview } from "@/api"

afterEach(() => vi.unstubAllGlobals())

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

it("getSession z językiem i bez", async () => {
  const fetchMock = stubFetch([])
  await getSession("python")
  await getSession()
  expect(fetchMock.mock.calls[0][0]).toBe("/api/session?language=python")
  expect(fetchMock.mock.calls[1][0]).toBe("/api/session")
})

it("runTests wysyła POST /api/run", async () => {
  const fetchMock = stubFetch({ results: [], duration_ms: 1 })
  const input = { language: "python" as const, kind: "function" as const, code: "x", tests: [{ input: "f()", expected: "1" }] }
  await runTests(input)
  expect(fetchMock.mock.calls[0][0]).toBe("/api/run")
  expect(fetchMock.mock.calls[0][1]?.method).toBe("POST")
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input)
})

it("getReviewPreview i submitReview", async () => {
  const fetchMock = stubFetch({ interval_days: 3, due_date: "2026-11-12" })
  await getReviewPreview(4)
  const review = { rating: "good" as const, duration_seconds: 5, tests_passed: null, tests_total: null, hint_used: false, solution_used: true }
  await submitReview(4, review)
  expect(fetchMock.mock.calls[0][0]).toBe("/api/tasks/4/review-preview")
  expect(fetchMock.mock.calls[1][0]).toBe("/api/tasks/4/review")
  expect(fetchMock.mock.calls[1][1]?.method).toBe("POST")
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(review)
})
