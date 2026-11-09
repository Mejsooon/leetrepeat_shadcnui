// Daty „RRRR-MM-DD” zawsze w czasie lokalnym. toISOString() liczy w UTC — po północy w Polsce
// pokazywałby jeszcze wczorajszy dzień, więc go tu nie używamy.

const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]
const MONTHS_LONG = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia",
  "września", "października", "listopada", "grudnia"]

export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${m}-${d}`
}

export function todayIso(): string {
  return toIso(new Date())
}

// „Dzisiaj” (także zaległe), „Jutro”, inaczej „1 gru 2026”
export function relativeDay(iso: string): string {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (iso <= toIso(today)) return "Dzisiaj"
  if (iso === toIso(tomorrow)) return "Jutro"
  const date = parseLocalDate(iso)
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

// „11 listopada 2026”; withYear = false → „11 listopada”
export function longDate(iso: string, withYear = true): string {
  const date = parseLocalDate(iso)
  const text = `${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`
  return withYear ? `${text} ${date.getFullYear()}` : text
}

// Odstęp zaokrąglony tak jak w backendzie (od połowy w górę)
export function inDays(interval: number): string {
  const days = Math.floor(interval + 0.5)
  if (days === 0) return "Jeszcze dziś"
  if (days === 1) return "Za 1 dzień"
  return `Za ${days} dni`
}

// „04:32”, a od godziny „1:04:32”
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")
  const s = String(seconds % 60).padStart(2, "0")
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

// „9 lis”; withYear = true → „9 lis 2026”
export function shortDate(iso: string, withYear = false): string {
  const date = parseLocalDate(iso)
  const text = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
  return withYear ? `${text} ${date.getFullYear()}` : text
}

// Data sprzed `days` dni (lokalnie), np. początek okresu „ostatnie 14 dni” = daysAgo(13)
export function daysAgo(days: number): string {
  const now = new Date()
  return toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))
}
