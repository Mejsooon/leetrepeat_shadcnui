import { Check, ChevronLeft, CircleAlert, CircleCheck, CircleMinus, CircleX, ClipboardCopy, Clock, Copy, Download, FileUp, Loader2, ShieldAlert, TriangleAlert, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ApiError, previewImport, type ImportPreviewItem } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { LANGUAGE_LABEL } from "@/labels"
import { IMPORT_PROMPT } from "@/lib/importPrompt"
import { plural } from "@/lib/plural"

const MAX_FILE_BYTES = 1_048_576

// Wynik sprawdzenia rozwiązania jednego zadania (tylko zadania "new")
type CheckState = "waiting" | "running" | "pass" | "fail" | "missing" | "error"
type Row = { item: ImportPreviewItem; check: CheckState | null; failed: number; total: number; checked: boolean }

// Okno „Importuj zadania” (spec importu §5): wklejenie / plik → podgląd ze sprawdzaniem → import
export default function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"paste" | "preview">("paste")
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [copied, setCopied] = useState(false)
  // Tekst ostatniego wklejenia — onChange porównuje z nim nową wartość pola (spec: wklejenie uruchamia podgląd)
  const pastedRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copyTimer.current), [])
  void onImported                                      // używane po imporcie (Zadanie 7 planu)

  // Wspólne dla wklejenia, pliku i przycisku „Sprawdź”
  async function runPreview(value: string) {
    setError("")
    setLoading(true)
    try {
      const { items } = await previewImport(value)
      setRows(items.map((item) => ({
        item,
        check: item.status === "new" ? "waiting" : null,
        failed: 0,
        total: 0,
        checked: item.status === "new",
      })))
      setStep("preview")
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Nie udało się sprawdzić pliku")
    } finally {
      setLoading(false)
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      // Zamknięcie czyści okno — kolejne otwarcie zaczyna od pustego pola
      setStep("paste")
      setText("")
      setError("")
      setRows([])
    }
  }

  const found = rows.length
  const selected = rows.filter((r) => r.checked).length

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload aria-hidden="true" />
          Importuj
        </Button>
      </DialogTrigger>
      <DialogContent className={step === "paste" ? "sm:max-w-xl" : "sm:max-w-3xl"}>
        <DialogHeader>
          <DialogTitle>Importuj zadania</DialogTitle>
          <DialogDescription>
            {step === "paste"
              ? "Wklej JSON od AI albo wybierz plik z dysku. Przed importem zobaczysz podgląd."
              : `Znaleziono ${plural(found, "zadanie", "zadania", "zadań")}. Zaznacz te, które chcesz dodać do biblioteki.`}
          </DialogDescription>
        </DialogHeader>

        {step === "paste" && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(IMPORT_PROMPT).then(() => {
                    setCopied(true)
                    clearTimeout(copyTimer.current)
                    copyTimer.current = setTimeout(() => setCopied(false), 2000)
                  }).catch(() => setError("Nie udało się skopiować instrukcji do schowka"))
                }}
              >
                {copied ? <Check className="text-success" aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}
                {copied ? "Skopiowano" : "Skopiuj instrukcję dla AI"}
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUp aria-hidden="true" />
                Wybierz plik…
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                aria-label="Plik z zadaniami"
                tabIndex={-1}
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""                       // ten sam plik da się wybrać ponownie
                  if (!file) return
                  if (file.size > MAX_FILE_BYTES) {
                    setError("Plik jest za duży (najwyżej 1 MB)")
                    return
                  }
                  let content: string
                  try {
                    content = await file.text()
                  } catch {
                    setError("Nie udało się odczytać pliku")
                    return
                  }
                  setText(content)
                  runPreview(content)
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="import-json">JSON z zadaniami</Label>
              <Textarea
                id="import-json"
                value={text}
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "import-error" : undefined}
                placeholder="Wklej tu odpowiedź AI — sam blok JSON albo razem z ```json"
                className="field-sizing-fixed h-64 resize-y font-mono text-[13px] md:text-[13px]"
                onPaste={(e) => {
                  pastedRef.current = e.clipboardData.getData("text")
                }}
                onChange={(e) => {
                  const value = e.target.value
                  setText(value)
                  setError("")
                  // Pole zawiera dokładnie wklejony tekst (wklejenie do pustego pola albo po Ctrl+A) → podgląd od razu
                  if (pastedRef.current !== null && value === pastedRef.current && value.trim() !== "") runPreview(value)
                  pastedRef.current = null
                }}
              />
              {error && (
                <p id="import-error" role="alert" className="flex items-center gap-1.5 text-[13px] text-destructive">
                  <CircleAlert className="size-3.5" aria-hidden="true" />
                  {error}
                </p>
              )}
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Sprawdzanie uruchomi rozwiązania na Twoim komputerze — importuj tylko zadania z zaufanego źródła.
              </p>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Anuluj</Button>
              </DialogClose>
              <Button disabled={text.trim() === "" || loading} onClick={() => runPreview(text)}>
                {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
                Sprawdź
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="max-h-[420px] overflow-auto rounded-lg border">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><span className="sr-only">Importować</span></TableHead>
                    <TableHead>Zadanie</TableHead>
                    <TableHead>Język</TableHead>
                    <TableHead>Sprawdzenie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const { item } = row
                    const name = item.title ?? `(bez tytułu) #${item.index + 1}`
                    const disabled = item.status !== "new"
                    let meta = `Pozycja ${item.index + 1} w pliku`
                    if (item.task) {
                      meta = `${item.task.kind === "function" ? "Funkcja" : "Program"} · ${plural(item.task.tests.length, "test", "testy", "testów")}`
                      if (item.task.tags.length > 0) meta += ` · ${item.task.tags.join(", ")}`
                    }
                    // Plakietka sprawdzenia: kolor, ikona i tekst zależą od statusu wiersza
                    let badgeClass = "bg-secondary text-muted-foreground"
                    let icon = <Clock aria-hidden="true" />
                    let label = "czeka na sprawdzenie"
                    if (item.status === "duplicate") {
                      icon = <Copy aria-hidden="true" />
                      label = item.message
                    } else if (item.status === "invalid") {
                      badgeClass = "bg-destructive/10 text-destructive"
                      icon = <CircleX aria-hidden="true" />
                      label = item.message
                    } else if (row.check === "running") {
                      badgeClass = "bg-info-muted text-info"
                      icon = <Loader2 className="animate-spin" aria-hidden="true" />
                      label = "sprawdzam…"
                    } else if (row.check === "pass") {
                      badgeClass = "bg-success-muted text-success"
                      icon = <CircleCheck aria-hidden="true" />
                      label = "Rozwiązanie przechodzi testy"
                    } else if (row.check === "fail") {
                      badgeClass = "bg-warning-muted text-warning"
                      icon = <TriangleAlert aria-hidden="true" />
                      label = `Nie przechodzi ${row.failed} z ${row.total} testów`
                    } else if (row.check === "missing") {
                      icon = <CircleMinus aria-hidden="true" />
                      label = `Nie sprawdzono (brak ${item.language === "csharp" ? ".NET" : "Pythona"})`
                    } else if (row.check === "error") {
                      icon = <CircleMinus aria-hidden="true" />
                      label = "Nie udało się sprawdzić"
                    }
                    return (
                      <TableRow key={item.index} className={disabled ? "bg-muted/50" : undefined}>
                        <TableCell className="align-top">
                          <Checkbox
                            aria-label={name}
                            checked={row.checked}
                            disabled={disabled}
                            onCheckedChange={(value) =>
                              setRows((current) => current.map((r, j) => (j === i ? { ...r, checked: value === true } : r)))
                            }
                          />
                        </TableCell>
                        <TableCell className="align-top whitespace-normal">
                          <div className="flex flex-col">
                            <span className={disabled ? "font-medium text-muted-foreground" : "font-medium"}>{name}</span>
                            <span className="text-xs text-muted-foreground">{meta}</span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {item.language === "python" || item.language === "csharp"
                            ? <Badge variant="outline">{LANGUAGE_LABEL[item.language]}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge className={`border-transparent ${badgeClass}`}>
                            {icon}
                            {label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">Zadania z błędem i duplikaty nie zostaną dodane.</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("paste")}>
                  <ChevronLeft aria-hidden="true" />
                  Wstecz
                </Button>
                <Button disabled>
                  <Download aria-hidden="true" />
                  {selected === 0 ? "Importuj" : `Importuj ${plural(selected, "zadanie", "zadania", "zadań")}`}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
