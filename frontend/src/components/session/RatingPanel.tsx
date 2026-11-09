import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react"
import { useEffect, useState } from "react"
import type { Rating, ReviewPreviewItem, RunResponse, SessionItem, Task } from "@/api"
import { CodeEditor } from "@/components/CodeEditor"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { DIFFICULTY_LABEL, LANGUAGE_LABEL } from "@/labels"
import { formatDuration, inDays, longDate } from "@/lib/dates"
import { cn } from "@/lib/utils"

// Cztery oceny w kolejności klawiszy 1–4 (teksty z designu „Ocena”)
const OPTIONS: { rating: Rating; label: string; key: string; desc: string; dot: string }[] = [
  { rating: "again", label: "Znowu", key: "1", desc: "Nie pamiętam rozwiązania", dot: "bg-red-600" },
  { rating: "hard", label: "Trudne", key: "2", desc: "Z dużym wysiłkiem", dot: "bg-amber-600" },
  { rating: "good", label: "Dobre", key: "3", desc: "Samodzielnie, po namyśle", dot: "bg-green-600" },
  { rating: "easy", label: "Łatwe", key: "4", desc: "Od razu, bez wahania", dot: "bg-blue-600" },
]

// 1 zadanie, 2–4 zadania, 5+ (i 12–14) zadań
function tasksWord(n: number) {
  if (n === 1) return "zadanie"
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return "zadania"
  return "zadań"
}

type Props = {
  task: Task
  code: string
  lastRun: RunResponse | null
  durationSeconds: number
  hintUsed: boolean
  solutionUsed: boolean
  preview: ReviewPreviewItem[] | null
  nextItem: SessionItem | null
  remainingAfter: number
  saving: boolean
  error: string | null
  onSave: (rating: Rating) => void
}

// Ekran „Ocena”: podsumowanie podejścia, wybór oceny z terminami, przejście do następnego zadania
export function RatingPanel(props: Props) {
  const { task, lastRun } = props
  const passed = lastRun ? lastRun.results.filter((r) => r.status === "pass").length : 0
  const allPassed = lastRun !== null && passed === lastRun.results.length
  const [selected, setSelected] = useState<Rating>(allPassed ? "good" : "again")

  // Klawisze 1–4 wybierają ocenę — ale nie wtedy, gdy ktoś pisze w polu tekstowym albo edytorze
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.closest("input, textarea, [contenteditable=true], .monaco-editor"))) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const option = OPTIONS.find((o) => o.key === e.key)
      if (option) setSelected(option.rating)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  let helpText = "Bez podpowiedzi i bez podglądu rozwiązania."
  if (props.hintUsed && props.solutionUsed) helpText = "Z podpowiedzią i podglądem rozwiązania."
  else if (props.hintUsed) helpText = "Z podpowiedzią."
  else if (props.solutionUsed) helpText = "Z podglądem rozwiązania."

  const chosen = props.preview?.find((p) => p.rating === selected)
  const returnText = selected === "again"
    ? `${task.title} wróci jeszcze w tej sesji.`
    : chosen ? `${task.title} wróci ${longDate(chosen.due_date, false)}.` : ""

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{allPassed ? "Rozwiązane. Jak Ci poszło?" : "Jak Ci poszło?"}</h2>
        <p className="text-sm text-muted-foreground">Wybierz ocenę, aby zaplanować kolejne podejście.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Podsumowanie podejścia */}
        <div className="flex flex-col gap-4 rounded-xl border p-5">
          {allPassed && (
            <span className="flex items-center gap-2 text-sm font-medium text-success">
              <CircleCheck className="size-4" /> Wszystkie testy przeszły
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{task.title}</span>
            <Badge variant="secondary">{LANGUAGE_LABEL[task.language]}</Badge>
            <Badge variant="outline">{DIFFICULTY_LABEL[task.difficulty]}</Badge>
          </div>
          {task.tags.length > 0 && <p className="text-sm text-muted-foreground">{task.tags.join(" · ")}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-3">
              <div className="text-2xl font-semibold tabular-nums">{formatDuration(props.durationSeconds)}</div>
              <div className="text-xs text-muted-foreground">czas rozwiązania</div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-2xl font-semibold tabular-nums">{lastRun ? `${passed} / ${lastRun.results.length}` : "—"}</div>
              <div className="text-xs text-muted-foreground">{lastRun ? "testy poprawne" : "testy nieuruchomione"}</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{helpText}</p>
          <CodeEditor
            value={props.code}
            onChange={() => {}}
            readOnly
            language={task.language}
            fileName={task.language === "python" ? "solution.py" : "Program.cs"}
            ariaLabel="Twoje ostatnie rozwiązanie"
            height={180}
          />
        </div>

        {/* Wybór oceny */}
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold">Jak łatwo było odtworzyć rozwiązanie?</h3>
            <p className="text-sm text-muted-foreground">
              Oceń pamięć, nie szybkość. Wybrana ocena: <strong className="font-medium text-foreground">{OPTIONS.find((o) => o.rating === selected)?.label}</strong>.
            </p>
          </div>
          <RadioGroup value={selected} onValueChange={(v) => setSelected(v as Rating)} className="grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((o) => {
              const item = props.preview?.find((p) => p.rating === o.rating)
              return (
                <label
                  key={o.rating}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border p-4",
                    selected === o.rating && "border-primary ring-2 ring-ring/30",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <RadioGroupItem value={o.rating} aria-label={o.label} />
                    <span className={cn("size-2 rounded-full", o.dot)} aria-hidden="true" />
                    <span className="font-medium">{o.label}</span>
                    <Kbd className="ml-auto">{o.key}</Kbd>
                  </span>
                  {item && (
                    <>
                      <span className="text-sm font-medium">{inDays(item.interval_days)}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.rating === "again" ? "Dzisiaj, w tej sesji" : longDate(item.due_date)}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">{o.desc}</span>
                </label>
              )
            })}
          </RadioGroup>

          {props.error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{props.error}</AlertTitle>
            </Alert>
          )}

          <div className="flex flex-col gap-3 rounded-xl border p-4">
            {props.nextItem ? (
              <>
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Następne w sesji · pozostanie {props.remainingAfter} {tasksWord(props.remainingAfter)}
                </span>
                <div className="flex flex-col">
                  <span className="font-medium">{props.nextItem.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[LANGUAGE_LABEL[props.nextItem.language], DIFFICULTY_LABEL[props.nextItem.difficulty], ...props.nextItem.tags].join(" · ")}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">To ostatnie zadanie w sesji</span>
            )}
            <Button onClick={() => props.onSave(selected)} disabled={props.saving}>
              {props.saving ? "Zapisywanie…" : "Zapisz ocenę i przejdź dalej"} <ArrowRight />
            </Button>
            {returnText && <p className="text-xs text-muted-foreground">{returnText}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
