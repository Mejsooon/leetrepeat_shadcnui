import { ArrowLeft, Bold, Check, CircleAlert, Eye, HardDrive, Italic, Pencil, Plus, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { Link, useBlocker, useNavigate, useParams } from "react-router"
import { ApiError, createTask, deleteTask, getTask, listTags, updateTask, type TaskInput } from "@/api"
import { CodeEditor } from "@/components/CodeEditor"
import { TagInput } from "@/components/TagInput"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useHeaderStatus } from "@/headerStatus"
import { DIFFICULTY_LABEL, KIND_LABEL, LANGUAGE_LABEL } from "@/labels"

const EMPTY_TASK: TaskInput = {
  title: "", language: "python", kind: "function", difficulty: "easy", description: "",
  starter_code: "", hint: "", solution: "", tests: [{ input: "", expected: "" }], tags: [],
}
const DIFFICULTY_DOT = { easy: "bg-success", medium: "bg-warning", hard: "bg-destructive" }
const BLANK = "Pole nie może być puste"

// Formularz zadania: /zadania/nowe (dodawanie) i /zadania/:id/edycja (edycja i usuwanie)
export default function ZadanieForm() {
  const { id } = useParams()
  const taskId = id ? Number(id) : null
  const navigate = useNavigate()
  const setHeaderStatus = useHeaderStatus()

  const [initial, setInitial] = useState<TaskInput>(EMPTY_TASK)
  const [form, setForm] = useState<TaskInput>(EMPTY_TASK)
  const [loading, setLoading] = useState(taskId !== null)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const leaving = useRef(false)             // po zapisie/usunięciu wychodzimy bez pytania
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // Edycja: wczytanie zadania
  useEffect(() => {
    if (taskId === null) return
    getTask(taskId)
      .then((task) => {
        const loaded: TaskInput = {
          title: task.title, language: task.language, kind: task.kind, difficulty: task.difficulty,
          description: task.description, starter_code: task.starter_code, hint: task.hint,
          solution: task.solution, tests: task.tests, tags: task.tags,
        }
        setInitial(loaded)
        setForm(loaded)
      })
      .catch((error) => {
        // 404 = zadania nie ma; inny błąd (np. serwer nie działa) — nie pokazujemy pustego formularza,
        // bo zapis nadpisałby prawdziwe zadanie pustymi polami
        if (error instanceof ApiError && error.status === 404) setNotFound(true)
        else setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [taskId])

  useEffect(() => {
    listTags().then((tags) => setTagSuggestions(tags.map((t) => t.name))).catch(() => {})
  }, [])

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  // Status w nagłówku: „Zmiany niezapisane” albo domyślne „Zapisano lokalnie”
  useEffect(() => {
    setHeaderStatus(dirty ? (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <span className="size-1.5 rounded-full bg-warning" />
        Zmiany niezapisane
      </span>
    ) : null)
    return () => setHeaderStatus(null)
  }, [dirty, setHeaderStatus])

  // Pytanie przed opuszczeniem strony z niezapisanymi zmianami (w aplikacji i przy zamykaniu karty)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  // Walidacja (te same komunikaty co w API)
  const isFunction = form.kind === "function"
  const errors = {
    title: form.title.trim() ? null : BLANK,
    description: form.description.trim() ? null : BLANK,
    solution: form.solution.trim() ? null : BLANK,
    tests: form.tests.length === 0 ? "Dodaj co najmniej jeden test" : null,
    testInputs: form.tests.map((t) => (isFunction && !t.input.trim() ? "Wywołanie funkcji nie może być puste" : null)),
  }
  const hasErrors = Boolean(errors.title || errors.description || errors.solution || errors.tests
    || errors.testInputs.some(Boolean))
  // Komunikat przy polu: gdy pole było ruszone albo po próbie zapisu
  const show = (field: string) => touched[field] || submitAttempted

  function set<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setTouched((t) => ({ ...t, [key]: true }))
  }

  function setTest(index: number, key: "input" | "expected", value: string) {
    setForm((f) => ({ ...f, tests: f.tests.map((t, i) => (i === index ? { ...t, [key]: value } : t)) }))
    setTouched((t) => ({ ...t, [`test-${index}`]: true }))
  }

  // B / I: owija zaznaczony tekst treści znacznikami Markdown
  function wrapSelection(mark: string) {
    const area = descriptionRef.current
    if (!area) return
    const { selectionStart: start, selectionEnd: end, value } = area
    set("description", value.slice(0, start) + mark + value.slice(start, end) + mark + value.slice(end))
  }

  async function save() {
    if (hasErrors) {
      setSubmitAttempted(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (taskId === null) await createTask(form)
      else await updateTask(taskId, form)
      leaving.current = true
      navigate("/zadania")
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "Nie udało się zapisać zadania")
      setSaving(false)
    }
  }

  async function remove() {
    if (taskId === null) return
    await deleteTask(taskId)
    leaving.current = true
    navigate("/zadania")
  }

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
      <Link to="/zadania">
        <ArrowLeft aria-hidden="true" />
        Wróć do listy zadań
      </Link>
    </Button>
  )

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <h1 className="text-3xl font-semibold tracking-tight">Edytuj zadanie</h1>
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Nie udało się wczytać zadania</AlertTitle>
          <AlertDescription>Sprawdź, czy działa python main.py, i odśwież stronę.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <h1 className="text-3xl font-semibold tracking-tight">Edytuj zadanie</h1>
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>Nie znaleziono zadania</AlertDescription>
        </Alert>
      </div>
    )
  }

  const editorLanguage = form.language
  const testLabels = isFunction
    ? ["Wywołanie", "Oczekiwany wynik (JSON)"]
    : ["Wejście (stdin)", "Oczekiwane wyjście"]

  return (
    <div className="flex flex-col gap-5">
      {backLink}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{taskId === null ? "Dodaj zadanie" : "Edytuj zadanie"}</h1>
          <p className="text-muted-foreground">
            {taskId === null
              ? "Zbuduj własną bibliotekę. Nowe zadanie zacznie od pierwszego podejścia."
              : `${initial.title} · ${LANGUAGE_LABEL[initial.language]} · Zmiany nie wpływają na historię powtórek.`}
          </p>
        </div>
        {taskId === null
          ? <Badge variant="secondary">Szkic · jeszcze niezapisany</Badge>
          : dirty && <Badge className="bg-warning-muted text-warning">Niezapisane zmiany</Badge>}
      </div>

      {loading ? <p className="text-muted-foreground">Wczytuję zadanie…</p> : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Tytuł zadania <span className="text-destructive">*</span></Label>
              <Input id="title" aria-label="Tytuł zadania" value={form.title} onChange={(e) => set("title", e.target.value)}
                aria-invalid={Boolean(show("title") && errors.title)} />
              {show("title") && errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Język <span className="text-destructive">*</span></Label>
                <Select value={form.language} onValueChange={(v) => set("language", v as TaskInput["language"])}>
                  <SelectTrigger aria-label="Język" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGE_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Trudność <span className="text-destructive">*</span></Label>
                <Select value={form.difficulty} onValueChange={(v) => set("difficulty", v as TaskInput["difficulty"])}>
                  <SelectTrigger aria-label="Trudność" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DIFFICULTY_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        <span className={`size-2 rounded-full ${DIFFICULTY_DOT[v as keyof typeof DIFFICULTY_DOT]}`} />
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Typ zadania <span className="text-destructive">*</span></Label>
              <ToggleGroup type="single" variant="outline" value={form.kind} aria-label="Typ zadania"
                onValueChange={(v) => v && set("kind", v as TaskInput["kind"])} className="w-full">
                {Object.entries(KIND_LABEL).map(([v, label]) => (
                  <ToggleGroupItem key={v} value={v} className="flex-1">{label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {isFunction ? "Testy wywołują Twoją funkcję i porównują wynik jako JSON." : "Testy podają tekst na wejście i porównują to, co program wypisze."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Tagi</Label>
              <TagInput value={form.tags} onChange={(tags) => set("tags", tags)} suggestions={tagSuggestions} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Treść zadania <span className="text-destructive">*</span></Label>
              <div className="overflow-hidden rounded-md border border-input shadow-xs">
                <div className="flex h-10 items-center gap-1 border-b bg-muted px-1.5">
                  <span className="px-1.5 text-xs font-medium text-muted-foreground">Markdown</span>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Pogrubienie"
                    onClick={() => wrapSelection("**")} disabled={preview}><Bold aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Kursywa"
                    onClick={() => wrapSelection("_")} disabled={preview}><Italic aria-hidden="true" /></Button>
                  <div className="flex-1" />
                  <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setPreview(!preview)}>
                    {preview ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    {preview ? "Pisz" : "Podgląd"}
                  </Button>
                </div>
                {preview ? (
                  <div className="prose-sm min-h-48 space-y-2 p-3 text-sm [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono">
                    <Markdown>{form.description}</Markdown>
                  </div>
                ) : (
                  <Textarea id="description" ref={descriptionRef} aria-label="Treść zadania" rows={9}
                    value={form.description} onChange={(e) => set("description", e.target.value)}
                    className="rounded-none border-0 shadow-none focus-visible:ring-0" />
                )}
              </div>
              {show("description") && errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="hint">Podpowiedź</Label>
              <Textarea id="hint" aria-label="Podpowiedź" rows={3} value={form.hint} onChange={(e) => set("hint", e.target.value)} />
              <p className="text-xs text-muted-foreground">Dostępna dopiero po wybraniu „Pokaż podpowiedź”.</p>
            </div>

            <div className="flex gap-2.5 rounded-lg border p-3 text-sm text-muted-foreground">
              <HardDrive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Zadanie, testy i rozwiązanie pozostają na tym urządzeniu. Możesz je później edytować.
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-2">
              <Label>Kod startowy</Label>
              <CodeEditor value={form.starter_code} onChange={(v) => set("starter_code", v)} language={editorLanguage}
                fileName={editorLanguage === "python" ? "main.py" : "Program.cs"} ariaLabel="Kod startowy" height={120} />
              <p className="text-xs text-muted-foreground">Wstawiany do edytora na początku rozwiązywania (może być pusty).</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Testy <span className="text-destructive">*</span></Label>
                <Badge variant="outline">{form.tests.length} {form.tests.length === 1 ? "przypadek"
                    : form.tests.length % 10 >= 2 && form.tests.length % 10 <= 4
                      && (form.tests.length % 100 < 12 || form.tests.length % 100 > 14) ? "przypadki" : "przypadków"}</Badge>
              </div>
              <ol className="flex flex-col gap-2">
                {form.tests.map((test, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <Input aria-label={`${testLabels[0]} – test ${i + 1}`} placeholder={testLabels[0]} value={test.input}
                        onChange={(e) => setTest(i, "input", e.target.value)} className="font-mono text-[13px]" />
                      <Input aria-label={`${testLabels[1]} – test ${i + 1}`} placeholder={testLabels[1]} value={test.expected}
                        onChange={(e) => setTest(i, "expected", e.target.value)} className="font-mono text-[13px]" />
                      <Button type="button" variant="ghost" size="icon" aria-label={`Usuń test ${i + 1}`}
                        disabled={form.tests.length === 1}
                        onClick={() => set("tests", form.tests.filter((_, j) => j !== i))}>
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                    {show(`test-${i}`) && errors.testInputs[i] && (
                      <p className="pl-7 text-xs text-destructive">{errors.testInputs[i]}</p>
                    )}
                  </li>
                ))}
              </ol>
              <Button type="button" variant="outline" size="sm" className="self-start"
                onClick={() => set("tests", [...form.tests, { input: "", expected: "" }])}>
                <Plus aria-hidden="true" />
                Dodaj test
              </Button>
              {errors.tests && <p className="text-xs text-destructive">{errors.tests}</p>}
              <p className="text-xs text-muted-foreground">Każdy test powinien sprawdzać jeden oczekiwany wynik.</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Rozwiązanie <span className="text-destructive">*</span></Label>
                <Badge variant="secondary"><Eye aria-hidden="true" />Ukryte podczas rozwiązywania</Badge>
              </div>
              <CodeEditor value={form.solution} onChange={(v) => set("solution", v)} language={editorLanguage}
                fileName={editorLanguage === "python" ? "solution.py" : "Solution.cs"} ariaLabel="Rozwiązanie" />
              {show("solution") && errors.solution && <p className="text-xs text-destructive">{errors.solution}</p>}
              <p className="text-xs text-muted-foreground">Pełne rozwiązanie referencyjne do sprawdzenia po próbie.</p>
            </div>
          </section>
        </div>
      )}

      {saveError && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4 shadow-xs">
        <div className="flex min-w-60 flex-1 flex-col gap-0.5">
          {hasErrors
            ? <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><CircleAlert className="size-4" aria-hidden="true" />Uzupełnij wymagane pola.</span>
            : <span className="flex items-center gap-1.5 text-sm font-medium text-success"><Check className="size-4" aria-hidden="true" />Wszystkie wymagane pola są uzupełnione.</span>}
          <span className="text-xs text-muted-foreground">* Pola wymagane · Po zapisie wrócisz do listy zadań.</span>
        </div>
        {taskId !== null && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="text-destructive">
                <Trash2 aria-hidden="true" />
                Usuń zadanie
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Usunąć zadanie „{initial.title}”?</AlertDialogTitle>
                <AlertDialogDescription>Historia powtórek też zostanie usunięta.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anuluj</AlertDialogCancel>
                <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">Usuń</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button asChild variant="outline"><Link to="/zadania">Anuluj</Link></Button>
        <Button type="button" onClick={save} disabled={saving || loading}>
          <Check aria-hidden="true" />
          {taskId === null ? "Zapisz zadanie" : "Zapisz zmiany"}
        </Button>
      </div>

      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opuścić stronę?</AlertDialogTitle>
            <AlertDialogDescription>Niezapisane zmiany przepadną.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Zostań</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Opuść</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
