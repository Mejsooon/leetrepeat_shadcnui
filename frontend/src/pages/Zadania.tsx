import { ChevronLeft, ChevronRight, Code, HardDrive, Info, Pencil, Plus, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { listTags, listTasks, type Difficulty, type Status, type Tag, type TaskList } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DIFFICULTY_LABEL, LANGUAGE_LABEL, STATUS_LABEL } from "@/labels"

const PAGE_SIZE = 10

// Kolory plakietek z designu (spec: trudność i status)
const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  easy: "bg-success-muted text-success",
  medium: "bg-warning-muted text-warning",
  hard: "bg-destructive/10 text-destructive",
}
const STATUS_CLASS: Record<Status, string> = {
  due: "bg-info-muted text-info",
  learning: "bg-warning-muted text-warning",
  consolidated: "bg-success-muted text-success",
  new: "bg-secondary text-secondary-foreground",
}
const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]

// Polska odmiana: 1 zadanie, 2–4 zadania, 5+ zadań (12–14 też „zadań”)
function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return few
  return many
}

export default function Zadania() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<TaskList | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [search, setSearch] = useState(params.get("q") ?? "")
  const searchRef = useRef<HTMLInputElement>(null)

  const page = Number(params.get("page") ?? "1") || 1
  const query = params.toString()

  // Ustawienie jednego filtra w adresie; każda zmiana filtra wraca na stronę 1
  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== "page") next.delete("page")
    setParams(next, { replace: key === "q" })
  }

  // Dane listy przy każdej zmianie filtrów/strony w adresie
  useEffect(() => {
    let cancelled = false
    const p = new URLSearchParams(query)
    listTasks({
      q: p.get("q") ?? undefined,
      language: (p.get("language") as never) ?? undefined,
      difficulty: (p.get("difficulty") as never) ?? undefined,
      status: (p.get("status") as never) ?? undefined,
      tag: p.get("tag") ?? undefined,
      page: p.get("page") ? Number(p.get("page")) : undefined,
    })
      .then((list) => {
        if (cancelled) return
        // Strona spoza zakresu (np. po usunięciu zadań) → ostatnia istniejąca strona
        if (list.items.length === 0 && list.total > 0 && list.page > list.pages) {
          const next = new URLSearchParams(p)
          next.set("page", String(list.pages))
          setParams(next, { replace: true })
          return
        }
        setData(list)
      })
      .catch(() => !cancelled && setData(null))
    return () => {
      cancelled = true
    }
  }, [query, setParams])

  useEffect(() => {
    listTags().then(setTags).catch(() => setTags([]))
  }, [])

  // Szukanie z opóźnieniem 300 ms, żeby nie pytać serwera przy każdej literze
  useEffect(() => {
    if (search === (params.get("q") ?? "")) return
    const timer = setTimeout(() => setFilter("q", search.trim() || null), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Ctrl+K / ⌘+K → wyszukiwarka
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const tomorrowIso = new Date(today.getTime() + 86400000).toISOString().slice(0, 10)
  function dueLabel(dueDate: string, status: Status) {
    if (status === "new") return "—"
    if (dueDate <= todayIso) return "Dzisiaj"
    if (dueDate === tomorrowIso) return "Jutro"
    const [y, m, d] = dueDate.split("-").map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
  }

  const counts = data?.counts
  const hasFilters = ["q", "language", "difficulty", "status", "tag"].some((k) => params.get(k))

  // Pusta biblioteka — ekran „pierwsze uruchomienie”
  if (counts && counts.library === 0 && !hasFilters) {
    const steps = [
      ["Dodaj własne zadanie", "Wpisz treść, testy i rozwiązanie. Wybierz język oraz trudność."],
      ["Rozwiąż z pamięci", "Pisz kod w edytorze. Uruchamiaj testy i sprawdzaj wyniki."],
      ["Wracaj w dobrym momencie", "Oceń próbę. Następna powtórka pojawi się w Twoim planie."],
    ]
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Twoje zadania</h1>
          <p className="text-muted-foreground">Twoja biblioteka jest jeszcze pusta. Zacznij od jednego zadania.</p>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
            <Code className="size-5" aria-hidden="true" />
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Twój kod. Twoje tempo.</h2>
            <p className="text-muted-foreground">
              Dodaj zadanie w Pythonie lub C#. Rozwiązuj je z pamięci, a LeetRepeat podpowie, kiedy warto do niego wrócić.
            </p>
          </div>
          <Button asChild>
            <Link to="/zadania/nowe">
              <Plus aria-hidden="true" />
              Dodaj pierwsze zadanie
            </Link>
          </Button>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex flex-col gap-2 rounded-xl border bg-card p-6 shadow-xs">
              <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {i + 1}
              </span>
              <span className="mt-1 font-semibold">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="size-4" aria-hidden="true" />
          Bez rejestracji. Twoje zadania i postępy zostają na tym urządzeniu.
        </p>
      </div>
    )
  }

  const from = data && data.total > 0 ? (data.page - 1) * PAGE_SIZE + 1 : 0
  const to = data ? Math.min(data.page * PAGE_SIZE, data.total) : 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Twoje zadania</h1>
          {counts && (
            <p className="text-muted-foreground">
              {counts.library} {plural(counts.library, "zadanie", "zadania", "zadań")} · {counts.due} do powtórki dziś ·{" "}
              {counts.new} {plural(counts.new, "nowe", "nowe", "nowych")}
            </p>
          )}
        </div>
        <Button asChild>
          <Link to="/zadania/nowe">
            <Plus aria-hidden="true" />
            Dodaj zadanie
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Szukaj zadań"
            placeholder="Szukaj po tytule lub treści…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-14"
          />
          <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">⌘ K</Kbd>
        </div>
        <Select value={params.get("language") ?? "all"} onValueChange={(v) => setFilter("language", v === "all" ? null : v)}>
          <SelectTrigger aria-label="Język"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Język: wszystkie</SelectItem>
            {Object.entries(LANGUAGE_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.get("difficulty") ?? "all"} onValueChange={(v) => setFilter("difficulty", v === "all" ? null : v)}>
          <SelectTrigger aria-label="Trudność"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Trudność: wszystkie</SelectItem>
            {Object.entries(DIFFICULTY_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.get("status") ?? "all"} onValueChange={(v) => setFilter("status", v === "all" ? null : v)}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: wszystkie</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.get("tag") ?? "all"} onValueChange={(v) => setFilter("tag", v === "all" ? null : v)}>
          <SelectTrigger aria-label="Tag"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tag: wszystkie</SelectItem>
            {tags.map((t) => <SelectItem key={t.name} value={t.name}>{t.name} ({t.count})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">Brak zadań dla tych filtrów</p>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("")
              setParams(new URLSearchParams())
            }}
          >
            Wyczyść filtry
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tytuł zadania</TableHead>
                <TableHead>Język</TableHead>
                <TableHead>Trudność</TableHead>
                <TableHead>Następna powtórka</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Akcje</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Link to={`/sesja?zadanie=${task.id}`} className="font-medium hover:underline">{task.title}</Link>
                    {task.tags.length > 0 && (
                      <div className="text-xs text-muted-foreground">{task.tags.join(" · ")}</div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{LANGUAGE_LABEL[task.language]}</Badge></TableCell>
                  <TableCell><Badge className={DIFFICULTY_CLASS[task.difficulty]}>{DIFFICULTY_LABEL[task.difficulty]}</Badge></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{dueLabel(task.due_date, task.status)}</TableCell>
                  <TableCell><Badge className={STATUS_CLASS[task.status]}>{STATUS_LABEL[task.status]}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon">
                      <Link to={`/zadania/${task.id}/edycja`} aria-label={`Edytuj ${task.title}`}>
                        <Pencil aria-hidden="true" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{from}–{to} z {data.total} zadań</span>
          <div className="flex items-center gap-2">
            <span className="mr-2">Strona {data.page} z {data.pages}</span>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}>
              <ChevronLeft aria-hidden="true" />
              Poprzednia
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setFilter("page", String(page + 1))}>
              Następna
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden="true" />
        Kliknij tytuł, aby otworzyć zadanie. Każdy język ma osobny harmonogram powtórek.
      </p>
    </div>
  )
}
