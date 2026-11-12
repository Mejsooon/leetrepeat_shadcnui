import { IMPORT_PROMPT } from "@/lib/importPrompt"

it("instrukcja zawiera poprawny przykład w formacie importu", () => {
  const block = IMPORT_PROMPT.match(/```json\n([\s\S]*?)\n```/)![1]
  const tasks = JSON.parse(block)
  expect(tasks).toHaveLength(2)
  expect(tasks.map((t: { kind: string }) => t.kind)).toEqual(["function", "program"])
  expect(tasks.map((t: { language: string }) => t.language)).toEqual(["python", "csharp"])
  for (const t of tasks) for (const key of ["title", "language", "kind", "description", "solution", "tests"]) expect(t).toHaveProperty(key)
})

it("instrukcja wymaga odpowiedzi samym blokiem JSON", () => {
  expect(IMPORT_PROMPT).toContain("Odpowiedz wyłącznie jednym blokiem kodu JSON")
})
