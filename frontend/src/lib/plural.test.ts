import { plural } from "@/lib/plural"

// Review Focus 5: polska odmiana liczebników
it.each([
  [1, "1 zadanie"], [2, "2 zadania"], [5, "5 zadań"], [12, "12 zadań"], [22, "22 zadania"], [0, "0 zadań"], [114, "114 zadań"],
])("%i", (n, text) => {
  expect(plural(n as number, "zadanie", "zadania", "zadań")).toBe(text)
})

it("powtórki i dni", () => {
  expect(plural(3, "powtórka", "powtórki", "powtórek")).toBe("3 powtórki")
  expect(plural(1, "dzień", "dni", "dni")).toBe("1 dzień")
  expect(plural(2, "dzień", "dni", "dni")).toBe("2 dni")
})
