import { ArrowRight, CircleAlert, CircleCheck, Clock, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { ApiError, getDashboard, type Dashboard, type LanguageProgress } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DIFFICULTY_LABEL, LANGUAGE_LABEL } from "@/labels"
import { longDate, relativeDay, todayIso } from "@/lib/dates"
import { plural } from "@/lib/plural"

const WEEKDAYS = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"]

// Ekran „Pulpit”: plan na dziś albo „wszystko zrobione”, liczby, postęp według języka, kolejka
export default function Pulpit() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Brak połączenia z aplikacją"))
  }, [])

  const today = todayIso()
  const subtitle = `${WEEKDAYS[new Date().getDay()]}, ${longDate(today)} · Twoja codzienna praktyka`

  // Który wariant karty głównej (kolejność ma znaczenie — patrz plan Etapu 4)
  let variant: "empty" | "done" | "plan" | "nothing" = "nothing"
  if (data) {
    if (data.library_count === 0) variant = "empty"
    else if (data.completed_today > 0 && data.due_count === 0) variant = "done"
    else if (data.session_count > 0) variant = "plan"
  }
  const nextText = data?.next_review_date
    ? `Kolejne powtórki: ${relativeDay(data.next_review_date).toLowerCase()}, ${longDate(data.next_review_date, false)}`
    : null
  // Około 2,5 min na zadanie, zaokrąglone w górę do 5 minut
  const minutes = data ? Math.ceil((data.session_count * 2.5) / 5) * 5 : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Nagłówek */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Dobry dzień na trochę kodu.</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/zadania/nowe"><Plus /> Nowe zadanie</Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wczytać Pulpitu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!data && !error && <p className="text-sm text-muted-foreground">Wczytywanie…</p>}

      {data && (
        <>
          {/* 4 karty z liczbami */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Do powtórki dziś"
              value={data.due_count}
              hint={variant === "done"
                ? `Ukończone powtórki: ${data.completed_today} z ${data.completed_today + data.due_count}`
                : `${data.due_by_language.python} Python · ${data.due_by_language.csharp} C#`}
            />
            <StatCard title="Nowe zadania" value={data.new_count} hint="Czekają na pierwsze podejście" />
            <StatCard title="Seria dni" value={data.streak} hint={`Najdłuższa seria: ${plural(data.longest_streak, "dzień", "dni", "dni")}`} />
            <StatCard
              title="Twoja biblioteka"
              value={data.library_count}
              hint={`${data.library_by_language.python} Python · ${data.library_by_language.csharp} C#`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Karta główna */}
            <Card>
              <CardContent className="flex flex-col gap-4">
                {variant === "empty" && (
                  <>
                    <h2 className="text-2xl font-semibold tracking-tight">Zacznij od pierwszego zadania</h2>
                    <p className="text-sm text-muted-foreground">Dodaj zadanie z testami — wróci do Ciebie wtedy, gdy warto je sobie przypomnieć.</p>
                    <Button className="self-start" asChild>
                      <Link to="/zadania/nowe">Dodaj zadanie</Link>
                    </Button>
                  </>
                )}
                {variant === "done" && (
                  <>
                    <span className="flex size-10 items-center justify-center rounded-full bg-success-muted text-success">
                      <CircleCheck className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="text-2xl font-semibold tracking-tight">Wszystko zrobione na dziś</h2>
                    <p className="text-sm text-muted-foreground">Dobra robota — wszystkie zaplanowane powtórki są za Tobą.</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">{plural(data.completed_today, "ukończone", "ukończone", "ukończonych")}</Badge>
                      {nextText && <span className="text-muted-foreground">{nextText}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.new_count > 0 && (
                        <Button asChild>
                          <Link to="/sesja">Zacznij nowe zadania <ArrowRight /></Link>
                        </Button>
                      )}
                      <Button variant="outline" asChild>
                        <Link to="/zadania/nowe"><Plus /> Dodaj nowe zadanie</Link>
                      </Button>
                    </div>
                  </>
                )}
                {variant === "plan" && (
                  <>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {plural(data.session_count, "mały krok", "małe kroki", "małych kroków")}. Wiedza na dłużej.
                    </h2>
                    <p className="text-sm text-muted-foreground">Twoje zadania wracają wtedy, gdy warto je sobie przypomnieć.</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden="true" />Około {minutes} minut</span>
                      {data.queue[0] && <span>Najpierw: {data.queue[0].title} · {LANGUAGE_LABEL[data.queue[0].language]}</span>}
                    </div>
                    <Button className="self-start" asChild>
                      <Link to="/sesja">Zacznij powtórkę <ArrowRight /></Link>
                    </Button>
                  </>
                )}
                {variant === "nothing" && (
                  <>
                    <h2 className="text-2xl font-semibold tracking-tight">Na dziś nic do powtórki</h2>
                    <p className="text-sm text-muted-foreground">Wszystkie zadania mają termin w przyszłości.</p>
                    {nextText && <p className="text-sm text-muted-foreground">{nextText}</p>}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Postęp według języka */}
            <Card>
              <CardHeader>
                <CardTitle>Postęp według języka</CardTitle>
                <CardDescription>Utrwalone, w nauce i nowe zadania</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <span className="text-xs text-muted-foreground">{plural(data.library_count, "zadanie", "zadania", "zadań")}</span>
                {data.progress_by_language.map((p) => <ProgressRow key={p.language} progress={p} />)}
                <p className="text-xs text-muted-foreground">Utrwalone = odstęp co najmniej 21 dni.</p>
              </CardContent>
            </Card>
          </div>

          {/* Kolejka */}
          {data.queue.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                {/* „Dziś w kolejce”, gdy lista to dzisiejsza sesja (także nowe zadania po „wszystko zrobione”) */}
                {data.session_count > 0 ? (
                  <>
                    <CardTitle>Dziś w kolejce</CardTitle>
                    <Link to="/zadania" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Zobacz wszystkie</Link>
                  </>
                ) : (
                  <>
                    <CardTitle>Następne w kolejce</CardTitle>
                    {data.next_review_date && <span className="text-sm text-muted-foreground">{longDate(data.next_review_date, false)}</span>}
                  </>
                )}
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {data.queue.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-col">
                      <Link to={`/sesja?zadanie=${item.id}`} className="font-medium hover:underline">{item.title}</Link>
                      <span className="text-xs text-muted-foreground">
                        {LANGUAGE_LABEL[item.language]} · {DIFFICULTY_LABEL[item.difficulty]}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">{relativeDay(item.due_date)}</span>
                  </div>
                ))}
                {data.queue_rest.length > 0 && (
                  <p className="pt-3 text-sm text-muted-foreground">
                    + {plural(data.queue_rest.length, "zadanie", "zadania", "zadań")}: {data.queue_rest.join(", ")}
                  </p>
                )}
                {variant === "done" && (
                  <p className="pt-3 text-sm text-muted-foreground">Dziś możesz już odpocząć. Postęp został zapisany.</p>
                )}
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Regularność jest ważniejsza niż tempo. Po rozwiązaniu oceń, jak łatwo było Ci je odtworzyć.
          </p>
        </>
      )}
    </div>
  )
}

function StatCard({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  )
}

// Wiersz postępu: pasek z trzech części (utrwalone / w nauce / nowe). Język bez zadań → pusty pasek.
function ProgressRow({ progress }: { progress: LanguageProgress }) {
  const total = progress.consolidated + progress.learning + progress.new
  const width = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{LANGUAGE_LABEL[progress.language]}</span>
        <span className="text-xs text-muted-foreground">
          {plural(total, "zadanie", "zadania", "zadań")} · {plural(progress.consolidated, "utrwalone", "utrwalone", "utrwalonych")}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="bg-primary" style={{ width: width(progress.consolidated) }} />
        <span className="bg-primary/50" style={{ width: width(progress.learning) }} />
        <span className="bg-primary/20" style={{ width: width(progress.new) }} />
      </div>
      <span className="text-xs text-muted-foreground">
        {plural(progress.consolidated, "utrwalone", "utrwalone", "utrwalonych")} · {progress.learning} w nauce ·{" "}
        {plural(progress.new, "nowe", "nowe", "nowych")}
      </span>
    </div>
  )
}
