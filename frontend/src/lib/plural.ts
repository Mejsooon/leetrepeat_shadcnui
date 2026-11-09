// Polska odmiana liczebników: „1 zadanie”, „2 zadania” (końcówki 2–4 poza 12–14), „5 zadań”
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `${n} ${one}`
  const lastDigit = n % 10
  const lastTwo = n % 100
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} ${few}`
  return `${n} ${many}`
}
