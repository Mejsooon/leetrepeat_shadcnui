import { CircleAlert, CircleCheck, Download, Monitor, Moon, RefreshCw, Sun, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useBlocker } from "react-router"
import {
  ApiError, BACKUP_URL, getRuntimes, getSettings, restoreBackup, saveSettings,
  type RuntimeInfo, type Runtimes, type SettingsResponse, type SettingsValues,
} from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useHeaderStatus } from "@/headerStatus"
import { longDate, todayIso } from "@/lib/dates"
import { plural } from "@/lib/plural"
import { cn } from "@/lib/utils"
import { useTheme, type Theme } from "@/theme"

const THEMES: { value: Theme; label: string; desc: string; icon: typeof Sun }[] = [
  { value: "light", label: "Jasny", desc: "Zawsze jasne tło.", icon: Sun },
  { value: "dark", label: "Ciemny", desc: "Zawsze ciemne tło.", icon: Moon },
  { value: "system", label: "Systemowy", desc: "Jak w ustawieniach systemu.", icon: Monitor },
]

const BLANK = "Pole nie może być puste"
const BAD_LIMIT = "Limit musi być od 1 do 300 sekund"

// Formularz trzyma limity jako tekst — żeby dało się wpisać „0” albo nic i zobaczyć komunikat
type Form = { python_path: string; dotnet_path: string; python_timeout_s: string; csharp_timeout_s: string }

function toForm(values: SettingsValues): Form {
  return { ...values, python_timeout_s: String(values.python_timeout_s), csharp_timeout_s: String(values.csharp_timeout_s) }
}

// Ekran „Ustawienia”: motyw, środowisko uruchomieniowe (ścieżki i limity), kopia zapasowa
export default function Ustawienia() {
  const { theme, setTheme } = useTheme()
  const setHeaderStatus = useHeaderStatus()

  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [runtimes, setRuntimes] = useState<Runtimes | null>(null)
  const [checking, setChecking] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Przywracanie z kopii: wybrany plik czeka na potwierdzenie w oknie dialogowym
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; text: string } | null>(null)

  function loadRuntimes() {
    setChecking(true)
    getRuntimes()
      .then(setRuntimes)
      .catch(() => setRuntimes(null))
      .finally(() => setChecking(false))
  }

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s)
        setForm(toForm(s.values))
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Brak połączenia z aplikacją"))
    loadRuntimes()
  }, [])

  const saved = settings ? toForm(settings.values) : null
  const dirty = form !== null && JSON.stringify(form) !== JSON.stringify(saved)

  // „Zmiany niezapisane” w nagłówku i pytanie przed wyjściem (jak w formularzu zadania)
  useEffect(() => {
    setHeaderStatus(dirty ? (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <span className="size-1.5 rounded-full bg-warning" />
        Zmiany niezapisane
      </span>
    ) : null)
    return () => setHeaderStatus(null)
  }, [dirty, setHeaderStatus])
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  // Walidacja — te same reguły i komunikaty co w API
  const pathError = (text: string) =>
    (!text.trim() ? BLANK : text.trim().length > 500 ? "Ścieżka może mieć najwyżej 500 znaków" : null)
  const limitError = (text: string) => (/^\d+$/.test(text.trim()) && +text >= 1 && +text <= 300 ? null : BAD_LIMIT)
  const errors = form ? {
    python_path: pathError(form.python_path),
    dotnet_path: pathError(form.dotnet_path),
    python_timeout_s: limitError(form.python_timeout_s),
    csharp_timeout_s: limitError(form.csharp_timeout_s),
  } : null
  const hasErrors = errors !== null && Object.values(errors).some(Boolean)

  function set(key: keyof Form, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function refreshDatabaseInfo() {
    getSettings().then((s) => setSettings((old) => (old ? { ...old, database: s.database } : s))).catch(() => {})
  }

  async function confirmRestore() {
    if (!pendingFile) return
    setRestoring(true)
    try {
      const result = await restoreBackup(pendingFile)
      setRestoreResult({
        ok: true,
        text: `Przywrócono bazę: ${plural(result.tasks, "zadanie", "zadania", "zadań")}. Poprzednia baza: ${result.backup_path}`,
      })
      // Przywrócona baza ma własne ścieżki i limity — formularz i stan środowiska bierzemy od nowa
      // (niezapisane zmiany dotyczyły starej bazy, więc przepadają)
      getSettings()
        .then((s) => {
          setSettings(s)
          setForm(toForm(s.values))
        })
        .catch(() => {})
      loadRuntimes()
    } catch (e) {
      setRestoreResult({ ok: false, text: e instanceof ApiError ? e.message : "Brak połączenia z aplikacją" })
    }
    setRestoring(false)
    setPendingFile(null)
    if (fileInput.current) fileInput.current.value = ""      // ten sam plik można wybrać jeszcze raz
  }

  const lastBackup = settings?.database.last_backup_at
  const lastBackupText = lastBackup ? `${longDate(lastBackup.slice(0, 10))}, ${lastBackup.slice(11, 16)}` : "nigdy"

  async function save() {
    if (!form || hasErrors) return
    setSaving(true)
    setError(null)
    try {
      const result = await saveSettings({
        python_path: form.python_path.trim(),
        dotnet_path: form.dotnet_path.trim(),
        python_timeout_s: Number(form.python_timeout_s),
        csharp_timeout_s: Number(form.csharp_timeout_s),
      })
      setSettings(result)
      setForm(toForm(result.values))
      loadRuntimes()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Nie udało się zapisać ustawień")
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">Wygląd, kopia zapasowa i środowisko do uruchamiania testów.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Coś poszło nie tak</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Wygląd */}
      <Card>
        <CardHeader>
          <CardTitle>Wygląd</CardTitle>
          <CardDescription>Wybór motywu zapisuje się w tej przeglądarce.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)} className="grid gap-3 sm:grid-cols-3" aria-label="Motyw aplikacji">
            {THEMES.map((t) => (
              <label
                key={t.value}
                className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4", theme === t.value && "border-primary ring-2 ring-ring/30")}
              >
                <RadioGroupItem value={t.value} aria-label={t.label} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-medium"><t.icon className="size-4" aria-hidden="true" />{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.desc}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Kopia zapasowa */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>Kopia zapasowa</CardTitle>
            <CardDescription>Wszystkie zadania, testy i historia ocen są w jednym pliku bazy.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2">
              <code className="text-xs break-all">{settings.database.path}</code>
              <span className="text-xs text-muted-foreground">
                {plural(settings.database.task_count, "zadanie", "zadania", "zadań")} · ostatnia kopia: {lastBackupText}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-xl border p-4">
                <span className="font-medium">Eksportuj bazę</span>
                <p className="text-xs text-muted-foreground">Pobierz kopię pliku, np. <code>leetrepeat-{todayIso()}.db</code>.</p>
                <Button variant="outline" className="self-start" asChild>
                  <a href={BACKUP_URL} download onClick={() => setTimeout(refreshDatabaseInfo, 1000)}>
                    <Download /> Pobierz kopię
                  </a>
                </Button>
              </div>
              <div className="flex flex-col gap-2 rounded-xl border p-4">
                <span className="font-medium">Przywróć z kopii</span>
                <p className="text-xs text-muted-foreground">Wybierz wcześniej pobrany plik <code>.db</code>.</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".db"
                  aria-label="Plik kopii bazy"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setRestoreResult(null)
                    setPendingFile(file)
                  }}
                />
                <Button variant="outline" className="self-start" onClick={() => fileInput.current?.click()} disabled={restoring}>
                  <Upload /> {restoring ? "Przywracanie…" : "Wybierz plik…"}
                </Button>
              </div>
            </div>

            <Alert>
              <CircleAlert />
              <AlertTitle>Przywrócenie zastępuje obecną bazę</AlertTitle>
              <AlertDescription>Przed zastąpieniem aplikacja sama zapisze kopię obecnego pliku obok niego.</AlertDescription>
            </Alert>

            {restoreResult && (restoreResult.ok ? (
              <Alert>
                <CircleCheck />
                <AlertTitle>Gotowe</AlertTitle>
                <AlertDescription className="break-all">{restoreResult.text}</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Nie udało się przywrócić bazy</AlertTitle>
                <AlertDescription>{restoreResult.text}. Obecne dane są nietknięte.</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Środowisko uruchomieniowe */}
      {form && errors && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Środowisko uruchomieniowe</CardTitle>
              <CardDescription>Programy, którymi aplikacja uruchamia Twój kod i testy.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadRuntimes} disabled={checking}>
              <RefreshCw className={cn(checking && "animate-spin")} /> Sprawdź ponownie
            </Button>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <RuntimeSection
              title="Python"
              name="Pythona"
              runtime={runtimes?.python}
              versionPrefix=""
              install="Zainstaluj Pythona 3.12+"
              path={form.python_path}
              pathError={errors.python_path}
              onPath={(v) => set("python_path", v)}
              limit={form.python_timeout_s}
              limitError={errors.python_timeout_s}
              onLimit={(v) => set("python_timeout_s", v)}
            />
            <RuntimeSection
              title="C# (.NET)"
              name=".NET"
              runtime={runtimes?.dotnet}
              versionPrefix=".NET SDK "
              install="Zainstaluj .NET 10 SDK"
              path={form.dotnet_path}
              pathError={errors.dotnet_path}
              onPath={(v) => set("dotnet_path", v)}
              limit={form.csharp_timeout_s}
              limitError={errors.csharp_timeout_s}
              onLimit={(v) => set("csharp_timeout_s", v)}
              note="Pierwsza kompilacja C# trwa kilka sekund — dlatego limit jest wyższy niż dla Pythona."
            />
          </CardContent>
        </Card>
      )}

      {/* Stopka z zapisem */}
      {form && settings && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Motyw zmienia się od razu. Ścieżki i limity zapisują się po kliknięciu „Zapisz”.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setForm(toForm(settings.defaults))}>Przywróć domyślne</Button>
            <Button onClick={save} disabled={!dirty || hasErrors || saving}>{saving ? "Zapisywanie…" : "Zapisz"}</Button>
          </div>
        </div>
      )}

      <AlertDialog open={pendingFile !== null} onOpenChange={(open) => {
        if (!open && !restoring) {
          setPendingFile(null)
          if (fileInput.current) fileInput.current.value = ""
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Przywrócić bazę z pliku {pendingFile?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Przywrócenie zastępuje obecną bazę. Przed zastąpieniem aplikacja sama zapisze kopię obecnego pliku obok niego.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>Przywróć</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Escape albo klik obok okna = „Zostań” */}
      <AlertDialog open={blocker.state === "blocked"} onOpenChange={(open) => { if (!open) blocker.reset?.() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opuścić stronę?</AlertDialogTitle>
            <AlertDialogDescription>Niezapisane zmiany ścieżek i limitów przepadną.</AlertDialogDescription>
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

type RuntimeProps = {
  title: string
  name: string
  runtime: RuntimeInfo | undefined
  versionPrefix: string
  install: string
  path: string
  pathError: string | null
  onPath: (value: string) => void
  limit: string
  limitError: string | null
  onLimit: (value: string) => void
  note?: string
}

// Jeden język: stan wykrycia, ścieżka do programu i limit czasu
function RuntimeSection(props: RuntimeProps) {
  const pathId = `path-${props.name}`
  const limitId = `limit-${props.name}`
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{props.title}</span>
        {props.runtime && (props.runtime.found ? (
          <span className="flex items-center gap-2 text-xs">
            <Badge variant="secondary" className="text-success">Wykryto</Badge>
            <span className="text-muted-foreground">{props.versionPrefix}{props.runtime.version}</span>
          </span>
        ) : (
          <Badge variant="outline" className="border-destructive/40 text-destructive">Nie wykryto</Badge>
        ))}
      </div>
      {props.runtime && !props.runtime.found && (
        <p className="text-xs text-muted-foreground">
          Zadania w tym języku są niedostępne. {props.install} albo popraw ścieżkę (instrukcja w README).
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={pathId}>Ścieżka do programu</Label>
        <Input
          id={pathId}
          aria-label={`Ścieżka do ${props.name}`}
          value={props.path}
          onChange={(e) => props.onPath(e.target.value)}
          className="font-mono text-sm"
          aria-invalid={props.pathError ? true : undefined}
        />
        {props.pathError && <p className="text-xs text-destructive">{props.pathError}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={limitId}>Limit czasu na uruchomienie</Label>
        <div className="flex items-center gap-2">
          <Input
            id={limitId}
            aria-label={`Limit czasu ${props.name}`}
            type="number"
            min={1}
            max={300}
            value={props.limit}
            onChange={(e) => props.onLimit(e.target.value)}
            className="w-24"
            aria-invalid={props.limitError ? true : undefined}
          />
          <span className="text-sm text-muted-foreground">sekund</span>
        </div>
        {props.limitError && <p className="text-xs text-destructive">{props.limitError}</p>}
      </div>
      {props.note && <p className="text-xs text-muted-foreground">{props.note}</p>}
    </div>
  )
}
