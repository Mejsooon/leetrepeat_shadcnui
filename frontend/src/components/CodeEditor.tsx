import { lazy, Suspense } from "react"

// Monaco jest duży — wczytujemy go osobnym plikiem dopiero, gdy edytor jest na ekranie
const CodeEditorMonaco = lazy(() => import("@/components/CodeEditorMonaco"))

export type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  language: "python" | "csharp" | "plaintext"
  fileName: string
  ariaLabel: string
  height?: number
  readOnly?: boolean
  // Ctrl/⌘+Enter wewnątrz edytora (np. „Uruchom testy”)
  onCtrlEnter?: () => void
}

const RUNTIME_LABEL = { python: "Python 3.12 · UTF-8", csharp: "C# · .NET 10", plaintext: "Tekst" }

// Edytor kodu z paskiem nazwy pliku (wygląd z designu). Zanim Monaco się wczyta — zwykłe pole tekstowe.
export function CodeEditor(props: CodeEditorProps) {
  const height = props.height ?? 220
  const fallback = (
    <textarea
      aria-label={props.ariaLabel}
      value={props.value}
      readOnly={props.readOnly}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && props.onCtrlEnter) {
          e.preventDefault()
          props.onCtrlEnter()
        }
      }}
      spellCheck={false}
      style={{ height }}
      className="block w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-5 outline-none"
    />
  )
  return (
    <div className="overflow-hidden rounded-md border border-input shadow-xs">
      <div className="flex h-9 items-center justify-between border-b bg-muted px-3">
        <span className="font-mono text-[13px]">{props.fileName}</span>
        <span className="text-xs text-muted-foreground">{RUNTIME_LABEL[props.language]}</span>
      </div>
      <Suspense fallback={fallback}>
        <CodeEditorMonaco {...props} height={height} />
      </Suspense>
    </div>
  )
}
