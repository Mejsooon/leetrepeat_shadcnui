import { CircleAlert, Timer } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import {
  ApiError, getReviewPreview, getSession, getTask, runTests, submitReview, updateNotes,
  type Rating, type ReviewPreviewItem, type RunResponse, type SessionItem, type Task,
} from "@/api"
import { RatingPanel } from "@/components/session/RatingPanel"
import { SolvePanel, type RunError } from "@/components/session/SolvePanel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useHeaderStatus } from "@/headerStatus"
import { DIFFICULTY_LABEL, LANGUAGE_LABEL } from "@/labels"
import { formatDuration, longDate } from "@/lib/dates"

// Ekran „Powtórka”: kolejka zadań z /api/session (albo jedno zadanie z ?zadanie=ID),
// dla każdego: Rozwiązywanie → Ocena. Kolejka żyje tylko w stanie strony.
export default function Sesja() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setHeaderStatus = useHeaderStatus()
  const singleId = Number(params.get("zadanie")) || null

  // --- Kolejka ---
  const [queue, setQueue] = useState<number[] | null>(null)          // id zadań; pierwsze = bieżące
  const [items, setItems] = useState<Record<number, SessionItem>>({})
  const [completed, setCompleted] = useState(0)
  const [turn, setTurn] = useState(0)                                // rośnie przy każdym kolejnym zadaniu
  const [loadError, setLoadError] = useState<string | null>(null)

  // --- Bieżące zadanie ---
  const [task, setTask] = useState<Task | null>(null)
  const [phase, setPhase] = useState<"solve" | "rate">("solve")
  const [code, setCode] = useState("")
  const [lastRun, setLastRun] = useState<RunResponse | null>(null)
  const [runKey, setRunKey] = useState(0)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<RunError>(null)
  const [hintUsed, setHintUsed] = useState(false)
  const [solutionUsed, setSolutionUsed] = useState(false)
  const [notes, setNotes] = useState("")
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [ratedSeconds, setRatedSeconds] = useState(0)                // czas zamrożony przy wejściu w ocenę

  const [preview, setPreview] = useState<ReviewPreviewItem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Najnowszy kod bez czekania na przerysowanie: Monaco zgłasza zmianę i Ctrl+Enter poza Reactem,
  // więc run() w starym domknięciu widziałby jeszcze poprzedni `code`
  const codeRef = useRef("")
  const savingRef = useRef(false)                                    // blokada podwójnego zapisu oceny
  const runningRef = useRef(false)                                   // blokada podwójnego uruchomienia (stan Reacta jest asynchroniczny)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingNotes = useRef<{ id: number; text: string } | null>(null)

  const currentId = queue && queue.length > 0 ? queue[0] : null

  // 1. Wczytanie kolejki
  useEffect(() => {
    const load = singleId
      ? getTask(singleId).then((t) => [{ id: t.id, title: t.title, language: t.language, difficulty: t.difficulty, tags: t.tags, status: t.status }])
      : getSession()
    load
      .then((list) => {
        setItems(Object.fromEntries(list.map((item) => [item.id, item])))
        setQueue(list.map((item) => item.id))
      })
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : "Nie udało się wczytać sesji"))
  }, [singleId])

  // 2. Wczytanie bieżącego zadania (także tego samego po „Znowu” — dlatego zależność od turn)
  useEffect(() => {
    if (currentId === null) return
    let cancelled = false
    setTask(null)
    getTask(currentId)
      .then((t) => {
        if (cancelled) return
        setTask(t)
        setCode(t.starter_code)
        codeRef.current = t.starter_code
        setNotes(t.notes)
        setLastRun(null)
        setRunError(null)
        setHintUsed(false)
        setSolutionUsed(false)
        setPhase("solve")
        setPreview(null)
        setSaveError(null)
        setStartedAt(Date.now())
        setNow(Date.now())
      })
      .catch((error) => {
        if (cancelled) return
        // Zadanie usunięte w międzyczasie — pomijamy je bez komunikatu
        if (error instanceof ApiError && error.status === 404) {
          setQueue((q) => (q ? q.slice(1) : q))
          setTurn((n) => n + 1)
        } else {
          setLoadError(error instanceof ApiError ? error.message : "Nie udało się wczytać zadania")
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentId, turn])

  // 3. Stoper — odświeżany co sekundę, licząc od wczytania zadania (restart przy każdym zadaniu)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const elapsed = phase === "rate" ? ratedSeconds : Math.max(0, Math.floor((now - startedAt) / 1000))

  // 4. Notatki: zapis 1 s po ostatniej zmianie. Nieudany zapis czeka w `failedNotes` (osobno dla każdego
  //    zadania) i jest ponawiany co 5 s. Przy wyjściu z ekranu i zamykaniu karty — zapis z keepalive, bez statusu.
  const mounted = useRef(true)
  const failedNotes = useRef<Record<number, string>>({})
  const lastSent = useRef<Record<number, string>>({})           // ostatnio wysłany tekst każdego zadania
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function sendNotes(id: number, text: string, leaving: boolean) {
    if (!leaving) setHeaderStatus(<span className="text-xs text-muted-foreground">Zapisywanie…</span>)
    lastSent.current[id] = text
    updateNotes(id, text, leaving)
      .then(() => {
        // Udało się — chyba że w międzyczasie ten sam zapis znów się nie powiódł z nowszym tekstem
        if (failedNotes.current[id] === text) delete failedNotes.current[id]
        if (!leaving && mounted.current && Object.keys(failedNotes.current).length === 0) setHeaderStatus(null)
      })
      .catch(() => {
        if (leaving || !mounted.current) return
        // Ponawiamy tylko najnowszy wysłany tekst — gdy w międzyczasie poszedł (albo czeka) nowszy,
        // stary błąd nie może go nadpisać
        if (lastSent.current[id] !== text || pendingNotes.current?.id === id) return
        failedNotes.current[id] = text
        setHeaderStatus(<span className="text-xs text-destructive">Nie udało się zapisać notatki — ponowię za chwilę</span>)
        if (!retryTimer.current) retryTimer.current = setTimeout(retryFailedNotes, 5000)
      })
  }

  function retryFailedNotes() {
    retryTimer.current = null
    for (const [id, text] of Object.entries(failedNotes.current)) sendNotes(Number(id), text, false)
  }

  function saveNotes(leaving = false) {
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = null
    const pending = pendingNotes.current
    pendingNotes.current = null
    if (pending) {
      delete failedNotes.current[pending.id]           // nowszy tekst zastępuje nieudany starszy
      sendNotes(pending.id, pending.text, leaving)
    }
    if (leaving) {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = null
      for (const [id, text] of Object.entries(failedNotes.current)) sendNotes(Number(id), text, true)
    }
  }

  function changeNotes(text: string) {
    if (!task) return
    setNotes(text)
    pendingNotes.current = { id: task.id, text }
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveNotesRef.current(), 1000)
  }

  // Wyjście z ekranu (np. „Zakończ sesję”) i zamykanie karty — oczekująca notatka nie może zginąć,
  // a ewentualny błąd nie może trafić do nagłówka innego ekranu
  const saveNotesRef = useRef(saveNotes)
  saveNotesRef.current = saveNotes
  useEffect(() => {
    mounted.current = true
    const onPageHide = () => saveNotesRef.current(true)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      saveNotesRef.current(true)
      mounted.current = false
      setHeaderStatus(null)
    }
  }, [setHeaderStatus])

  // 5. Uruchamianie testów (przycisk i Ctrl/⌘+Enter)
  async function run() {
    if (!task || runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setRunError(null)
    try {
      const response = await runTests({ language: task.language, kind: task.kind, code: codeRef.current, tests: task.tests })
      setLastRun(response)
      setRunKey((k) => k + 1)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Nieznany błąd"
      setRunError({ missingRuntime: error instanceof ApiError && error.status === 503, message })
    }
    runningRef.current = false
    setRunning(false)
  }

  const runRef = useRef(run)
  runRef.current = run
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // defaultPrevented: edytor już obsłużył skrót sam
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.defaultPrevented && phase === "solve") {
        e.preventDefault()
        runRef.current()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase])

  function goToRating() {
    // W trakcie testów nie przechodzimy dalej — wynik zadania A trafiłby do zadania B
    if (runningRef.current) return
    saveNotes()
    setRatedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    setPhase("rate")
    if (task) getReviewPreview(task.id).then(setPreview).catch(() => setPreview(null))
  }

  // Zapis oceny i przejście dalej. „Znowu” → zadanie na koniec kolejki, inaczej zadanie ukończone.
  async function saveRating(rating: Rating) {
    if (!task || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await submitReview(task.id, {
        rating,
        duration_seconds: ratedSeconds,
        tests_passed: lastRun ? lastRun.results.filter((r) => r.status === "pass").length : null,
        tests_total: lastRun ? lastRun.results.length : null,
        hint_used: hintUsed,
        solution_used: solutionUsed,
      })
      // Zadanie czyścimy razem z kolejką — panel oceny znika od razu (bez okna na drugi zapis)
      setTask(null)
      setQueue((q) => (q ? (rating === "again" ? [...q.slice(1), q[0]] : q.slice(1)) : q))
      if (rating !== "again") setCompleted((n) => n + 1)
      setTurn((n) => n + 1)
    } catch {
      setSaveError("Nie udało się zapisać oceny")
    }
    savingRef.current = false
    setSaving(false)
  }

  // --- Widoki ---
  if (loadError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Nie udało się wczytać sesji</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }
  if (queue === null) return <p className="text-sm text-muted-foreground">Wczytywanie…</p>

  if (queue.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{completed > 0 ? "Sesja zakończona" : "Brak zadań do powtórki"}</EmptyTitle>
          <EmptyDescription>
            {completed > 0 ? `Ukończone zadania: ${completed}` : "Na dziś nie ma nic do powtórki ani nowych zadań."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {completed > 0 ? (
            <Button onClick={() => navigate("/")}>Wróć na Pulpit</Button>
          ) : (
            <Button asChild>
              <Link to="/zadania">Przejdź do zadań</Link>
            </Button>
          )}
        </EmptyContent>
      </Empty>
    )
  }

  if (!task) return <p className="text-sm text-muted-foreground">Wczytywanie zadania…</p>

  // Następne w sesji: kolejne w kolejce (przy ostatnim zadaniu — brak)
  const nextItem = queue.length > 1 ? items[queue[1]] ?? null : null
  const remainingAfter = queue.length - 1
  const lastReviewed = task.last_reviewed_at ? `Ostatnia powtórka: ${longDate(task.last_reviewed_at.slice(0, 10), false)}` : null
  const subtitle = [task.tags.join(" · "), lastReviewed].filter(Boolean).join(" · ")

  return (
    <div className="flex flex-col gap-6">
      {/* Pasek sesji */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
            <Badge variant="secondary">{LANGUAGE_LABEL[task.language]}</Badge>
            <Badge variant="outline">{DIFFICULTY_LABEL[task.difficulty]}</Badge>
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>Zakończ sesję</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">Powtórka {completed + 1} z {completed + queue.length}</span>
        <span className="text-muted-foreground">{completed} ukończonych · {queue.length} pozostało</span>
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground tabular-nums">
          <Timer className="size-4" aria-hidden="true" />
          {formatDuration(elapsed)}
        </span>
      </div>

      {phase === "solve" ? (
        <SolvePanel
          task={task}
          code={code}
          onCodeChange={(value) => {
            codeRef.current = value
            setCode(value)
          }}
          running={running}
          lastRun={lastRun}
          runKey={runKey}
          runError={runError}
          onRun={run}
          hintUsed={hintUsed}
          solutionUsed={solutionUsed}
          onShowHint={() => setHintUsed(true)}
          onShowSolution={() => setSolutionUsed(true)}
          onRate={goToRating}
          notes={notes}
          onNotesChange={changeNotes}
        />
      ) : (
        <RatingPanel
          task={task}
          code={code}
          lastRun={lastRun}
          durationSeconds={ratedSeconds}
          hintUsed={hintUsed}
          solutionUsed={solutionUsed}
          preview={preview}
          nextItem={nextItem}
          remainingAfter={remainingAfter}
          saving={saving}
          error={saveError}
          onSave={saveRating}
        />
      )}
    </div>
  )
}
