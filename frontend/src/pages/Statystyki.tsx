import { CircleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ApiError, getStats, type Stats } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LANGUAGE_LABEL } from "@/labels"
import { daysAgo, formatDuration, longDate, parseLocalDate, shortDate, todayIso } from "@/lib/dates"
import { plural } from "@/lib/plural"
import { cn } from "@/lib/utils"

const PERIODS = ["7", "14", "30", "90"]
const WEEKDAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"]
const CHART: ChartConfig = {
  python: { label: "Python", color: "var(--chart-1)" },
  csharp: { label: "C#", color: "var(--chart-2)" },
}

// Ekran „Statystyki”: rytm nauki za ostatnie N dni (?dni=7|14|30|90, domyślnie 14)
export default function Statystyki() {
  const [params, setParams] = useSearchParams()
  const days = PERIODS.includes(params.get("dni") ?? "") ? Number(params.get("dni")) : 14
  const to = todayIso()
  const from = daysAgo(days - 1)

  const [data, setData] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  useEffect(() => {
    setError(null)
    getStats(from, to)
      .then((s) => {
        setData(s)
        setLoadedAt(new Date())
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Brak połączenia z aplikacją"))
  }, [from, to])

  // „27 paź – 9 lis 2026” (rok przy początku tylko, gdy inny niż przy końcu)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const rangeText = `${shortDate(from, !sameYear)} – ${shortDate(to, true)}`

  const percent = (rate: number) => `${Math.round(rate * 100)}%`
  let rateLabel: string | null = null
  if (data?.success_rate != null) {
    if (data.success_rate >= 0.8) rateLabel = "Dobrze"
    else if (data.success_rate >= 0.6) rateLabel = "Średnio"
    else rateLabel = "Słabo"
  }
  const successful = data ? data.success_by_language.python.successful + data.success_by_language.csharp.successful : 0
  const avgPy = data?.avg_duration_by_language.python
  const avgCs = data?.avg_duration_by_language.csharp
  const avgText = (s: number | null | undefined) => (s == null ? "—" : formatDuration(Math.round(s)))
  const sumPy = data ? data.daily.reduce((n, d) => n + d.python, 0) : 0
  const sumCs = data ? data.daily.reduce((n, d) => n + d.csharp, 0) : 0
  const loadedTime = loadedAt
    ? `${String(loadedAt.getHours()).padStart(2, "0")}:${String(loadedAt.getMinutes()).padStart(2, "0")}`
    : ""

  return (
    <div className="flex flex-col gap-6">
      {/* Nagłówek i wybór okresu */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Zobacz, jak rośniesz.</h1>
          <p className="text-sm text-muted-foreground">Małe, regularne powtórki składają się na trwałą wiedzę.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Select
            value={String(days)}
            onValueChange={(v) => setParams((p) => {
              const next = new URLSearchParams(p)
              next.set("dni", v)
              return next
            })}
          >
            <SelectTrigger aria-label="Okres"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => <SelectItem key={p} value={p}>Ostatnie {p} dni</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{rangeText}</span>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wczytać statystyk</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!data && !error && <p className="text-sm text-muted-foreground">Wczytywanie…</p>}

      {data && (
        <>
          {/* 4 karty */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription>Wykonane powtórki</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{data.reviews_count}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                {data.by_language.python} Python · {data.by_language.csharp} C#
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription className="flex items-center justify-between">
                  Skuteczność
                  {rateLabel && <Badge variant="secondary">{rateLabel}</Badge>}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{data.success_rate == null ? "—" : percent(data.success_rate)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                {data.reviews_count === 0 ? "Brak ocen w tym okresie" : `${successful} z ${data.reviews_count} bez ponownej nauki`}
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription>Średni czas zadania</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{avgText(data.avg_duration_s)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                Python {avgText(avgPy)} · C# {avgText(avgCs)}
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription>Seria dni</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{data.streak}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                Najdłuższa seria: {plural(data.longest_streak, "dzień", "dni", "dni")}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* Historia powtórek — słupki złożone Python / C# */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle>Historia powtórek</CardTitle>
                  <CardDescription>Ostatnie {plural(days, "dzień", "dni", "dni")}</CardDescription>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-1" />Python · {sumPy}</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-2" />C# · {sumCs}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <ChartContainer config={CHART} className="aspect-auto h-56 w-full">
                  <BarChart data={data.daily.map((d) => ({ ...d, day: String(parseLocalDate(d.date).getDate()) }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="python" stackId="a" fill="var(--color-python)" />
                    <Bar dataKey="csharp" stackId="a" fill="var(--color-csharp)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                <p className="text-xs text-muted-foreground">liczba wykonanych powtórek dziennie</p>
              </CardContent>
            </Card>

            {/* Skuteczność według języka */}
            <Card>
              <CardHeader>
                <CardTitle>Skuteczność według języka</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {(["python", "csharp"] as const).map((lang) => {
                  const s = data.success_by_language[lang]
                  return (
                    <div key={lang} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{LANGUAGE_LABEL[lang]}</span>
                        <span className="font-semibold tabular-nums">{s.total === 0 ? "—" : percent(s.successful / s.total)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className={cn("block h-full", lang === "python" ? "bg-chart-1" : "bg-chart-2")}
                          style={{ width: s.total === 0 ? "0%" : percent(s.successful / s.total) }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.total === 0 ? "Brak ocen" : `${s.successful} z ${s.total} udanych`}</span>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground">
                  Udana powtórka = ocena Trudne, Dobre lub Łatwe. „Znowu” oznacza ponowną naukę.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Zadania wymagające uwagi */}
            <Card>
              <CardHeader>
                <CardTitle>Zadania, które wymagają uwagi</CardTitle>
                <CardDescription>Według skuteczności</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {data.weak_tasks.length === 0 && (
                  <p className="text-sm text-muted-foreground">Brak zadań z niską skutecznością.</p>
                )}
                {data.weak_tasks.map((t) => {
                  const rate = Math.round((t.successful / t.total) * 100)
                  return (
                    <div key={t.id} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <Link to={`/sesja?zadanie=${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                        <span className="font-semibold tabular-nums">{rate}%</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {LANGUAGE_LABEL[t.language]} · {t.successful} z {t.total} udanych
                      </span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className={cn("block h-full", rate < 60 ? "bg-destructive" : rate < 70 ? "bg-warning" : "bg-foreground")}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Ostatnie dni */}
            <Card>
              <CardHeader>
                <CardTitle>Ostatnie dni</CardTitle>
                <CardDescription>Powtórki / skuteczność</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {data.recent_days.map((d) => (
                  <div key={d.date} className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
                    <span>
                      {shortDate(d.date)} · {d.date === to ? "dzisiaj" : WEEKDAYS[parseLocalDate(d.date).getDay()]}
                    </span>
                    <span className="flex gap-4 tabular-nums">
                      <span className="text-muted-foreground">{plural(d.count, "powtórka", "powtórki", "powtórek")}</span>
                      <span className="w-10 text-right font-medium">{d.success_rate == null ? "—" : percent(d.success_rate)}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Dane z tego urządzenia · Stan na {longDate(to)}, {loadedTime}
          </p>
        </>
      )}
    </div>
  )
}
