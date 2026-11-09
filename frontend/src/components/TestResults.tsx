import { Check, CircleCheck, CircleX, Clock, X } from "lucide-react"
import { useState } from "react"
import type { RunResponse, RunStatus } from "@/api"
import { cn } from "@/lib/utils"

const DETAIL_LABEL: Record<RunStatus, string> = {
  pass: "wynik poprawny",
  fail: "nieprawidłowy wynik",
  error: "błąd",
  timeout: "przekroczony czas",
}

// Wynik ostatniego uruchomienia testów (wygląd z designu „Rozwiązywanie”)
export function TestResults({ response }: { response: RunResponse }) {
  const results = response.results
  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.length - passed

  // Domyślnie otwarty pierwszy niezaliczony test, a gdy wszystkie zaliczone — ostatni
  const firstFailed = results.findIndex((r) => r.status !== "pass")
  const [chosen, setChosen] = useState<number | null>(null)
  const open = chosen ?? (firstFailed >= 0 ? firstFailed : results.length - 1)
  const current = results[open]

  // Polska odmiana: 1 test nie przeszedł, 2–4 testy nie przeszły, 5+ (i 12–14) testów nie przeszło
  let title = "Wszystkie testy przeszły"
  if (failed === 1) title = "1 test nie przeszedł"
  else if (failed > 1) {
    const few = failed % 10 >= 2 && failed % 10 <= 4 && (failed % 100 < 12 || failed % 100 > 14)
    title = few ? `${failed} testy nie przeszły` : `${failed} testów nie przeszło`
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Wyniki testów">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-2 font-medium", failed ? "text-destructive" : "text-success")}>
          {failed ? <CircleX className="size-4" /> : <CircleCheck className="size-4" />}
          {title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {passed}/{results.length} poprawne · {response.duration_ms} ms
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {results.map((r, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={i === open}
            onClick={() => setChosen(i)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
              r.status === "pass" ? "bg-success-muted text-success" : "bg-destructive/10 text-destructive",
              i === open && "ring-2 ring-ring/50",
            )}
          >
            {r.status === "pass" ? <Check className="size-3" /> : r.status === "timeout" ? <Clock className="size-3" /> : <X className="size-3" />}
            Test {i + 1}
          </button>
        ))}
      </div>

      {current && (
        <div
          role={current.status === "pass" ? undefined : "alert"}
          className={cn(
            "flex flex-col gap-2 rounded-lg border px-4 py-3",
            current.status === "pass" ? "border-success/30 bg-success-muted" : "border-destructive/30 bg-destructive/10",
          )}
        >
          <span className={cn("font-medium", current.status === "pass" ? "text-success" : "text-destructive")}>
            Test {open + 1} · {DETAIL_LABEL[current.status]}
          </span>
          <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
            <span className="text-muted-foreground">Dane wejściowe</span>
            <code className="font-mono whitespace-pre-wrap break-all">{current.input}</code>
            <span className="text-muted-foreground">Oczekiwany wynik</span>
            <code className="font-mono whitespace-pre-wrap break-all">{current.expected}</code>
            {current.actual !== null && (
              <>
                <span className="text-muted-foreground">Otrzymany wynik</span>
                <code className={cn("font-mono whitespace-pre-wrap break-all", current.status !== "pass" && "text-destructive")}>
                  {current.actual}
                </code>
              </>
            )}
          </div>
          {current.message && (
            <pre className="overflow-x-auto rounded-md bg-background/60 p-2 font-mono text-xs whitespace-pre-wrap">{current.message}</pre>
          )}
        </div>
      )}
    </section>
  )
}
