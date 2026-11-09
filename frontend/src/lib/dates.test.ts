import { daysAgo, formatDuration, inDays, longDate, relativeDay, shortDate, todayIso } from "@/lib/dates"

afterEach(() => vi.useRealTimers())

// vite.config.ts ustawia TZ = Europe/Warsaw, więc test sprawdza czas lokalny, nie UTC
it("dziś liczone lokalnie, nie w UTC", () => {          // Review Focus 4
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-09T23:30:00Z"))   // 10 listopada 00:30 w Warszawie
  expect(todayIso()).toBe("2026-11-10")
  expect(relativeDay("2026-11-10")).toBe("Dzisiaj")
  expect(relativeDay("2026-11-09")).toBe("Dzisiaj")
  expect(relativeDay("2026-11-11")).toBe("Jutro")
  expect(relativeDay("2026-12-01")).toBe("1 gru 2026")
})

it("longDate", () => {
  expect(longDate("2026-11-11")).toBe("11 listopada 2026")
})

it("inDays", () => {
  expect(inDays(0)).toBe("Jeszcze dziś")
  expect(inDays(1)).toBe("Za 1 dzień")
  expect(inDays(2.5)).toBe("Za 3 dni")
})

it("formatDuration", () => {
  expect(formatDuration(272)).toBe("04:32")
  expect(formatDuration(3872)).toBe("1:04:32")
})

it("shortDate i daysAgo", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 9, 12, 0))
  expect(shortDate("2026-10-27")).toBe("27 paź")
  expect(shortDate("2026-11-09", true)).toBe("9 lis 2026")
  expect(daysAgo(13)).toBe("2026-10-27")
  expect(daysAgo(0)).toBe("2026-11-09")
})
