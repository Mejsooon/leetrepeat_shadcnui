import { CircleAlert, Eye, Lightbulb, Pencil, Play } from "lucide-react"
import Markdown from "react-markdown"
import { Link } from "react-router"
import type { RunResponse, Task } from "@/api"
import { CodeEditor } from "@/components/CodeEditor"
import { TestResults } from "@/components/TestResults"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { modKey } from "@/lib/platform"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

// Błąd uruchomienia: brak Pythona / .NET (503 — link do Ustawień) albo inny problem
export type RunError = { missingRuntime: boolean; message: string } | null

type Props = {
  task: Task
  code: string
  onCodeChange: (code: string) => void
  running: boolean
  lastRun: RunResponse | null
  runKey: number
  runError: RunError
  onRun: () => void
  hintUsed: boolean
  solutionUsed: boolean
  onShowHint: () => void
  onShowSolution: () => void
  onRate: () => void
  notes: string
  onNotesChange: (notes: string) => void
}

// Ekran „Rozwiązywanie”: treść i notatki po lewej, edytor i wyniki testów po prawej
export function SolvePanel(props: Props) {
  const { task } = props
  const allPassed = props.lastRun !== null && props.lastRun.results.every((r) => r.status === "pass")
  const fileName = task.language === "python" ? "solution.py" : "Program.cs"

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Lewa kolumna: treść zadania i notatki */}
      <div className="flex flex-col gap-3">
        <Tabs defaultValue="tresc">
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="tresc">Treść zadania</TabsTrigger>
              <TabsTrigger value="notatki">Notatki</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/zadania/${task.id}/edycja`}>
                <Pencil /> Edytuj zadanie
              </Link>
            </Button>
          </div>
          <TabsContent value="tresc">
            <div className="space-y-3 rounded-lg border p-4 text-sm leading-6 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3">
              <Markdown>{task.description}</Markdown>
            </div>
          </TabsContent>
          <TabsContent value="notatki">
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <label htmlFor="session-notes" className="text-sm font-medium">Twoje notatki</label>
              <Textarea
                id="session-notes"
                value={props.notes}
                onChange={(e) => props.onNotesChange(e.target.value)}
                placeholder="Co warto zapamiętać przy tym zadaniu?"
                className="min-h-40"
              />
              <p className="text-xs text-muted-foreground">Zapisuje się samo po chwili bez pisania.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Prawa kolumna: edytor, testy, podpowiedź, przejście do oceny */}
      <div className="flex min-w-0 flex-col gap-4">
        <CodeEditor
          value={props.code}
          onChange={props.onCodeChange}
          onCtrlEnter={props.onRun}
          language={task.language}
          fileName={fileName}
          ariaLabel="Twoje rozwiązanie"
          height={300}
        />
        <div className="flex items-center gap-2">
          <Button onClick={props.onRun} disabled={props.running}>
            <Play /> {props.running ? "Uruchamianie…" : "Uruchom testy"}
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Kbd>{modKey()}</Kbd> + <Kbd>Enter</Kbd>
          </span>
        </div>

        {props.runError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{props.runError.missingRuntime ? "Niedostępne" : "Nie udało się uruchomić testów"}</AlertTitle>
            <AlertDescription>
              {props.runError.missingRuntime ? (
                <>
                  <p>{props.runError.message}</p>
                  <p>
                    Sprawdź ścieżki w <Link to="/ustawienia" className="underline">Ustawienia</Link>.
                  </p>
                </>
              ) : (
                <p>{props.runError.message}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {props.lastRun && <TestResults key={props.runKey} response={props.lastRun} />}

        {props.hintUsed && (
          <Alert>
            <Lightbulb />
            <AlertTitle>Podpowiedź</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">{task.hint}</AlertDescription>
          </Alert>
        )}
        {props.solutionUsed && (
          <CodeEditor
            value={task.solution}
            onChange={() => {}}
            readOnly
            language={task.language}
            fileName="Rozwiązanie"
            ariaLabel="Rozwiązanie wzorcowe"
            height={200}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {task.hint.trim() !== "" && !props.hintUsed && (
            <Button variant="outline" onClick={props.onShowHint}>
              <Lightbulb /> Pokaż podpowiedź
            </Button>
          )}
          {!props.solutionUsed && (
            <Button variant="outline" onClick={props.onShowSolution}>
              <Eye /> Pokaż rozwiązanie
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {!allPassed && props.lastRun && (
              <span className="text-xs text-muted-foreground">Popraw kod i uruchom testy ponownie.</span>
            )}
            <Button variant={allPassed ? "default" : "outline"} onClick={props.onRate} disabled={props.running}>
              Przejdź do oceny
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
