import Editor, { loader } from "@monaco-editor/react"
import { useEffect, useRef } from "react"
import * as monaco from "monaco-editor"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import type { CodeEditorProps } from "@/components/CodeEditor"
import { useTheme } from "@/theme"

// Monaco z paczki npm, wbudowany w dist — domyślnie @monaco-editor/react pobiera go z CDN,
// co nie zadziała offline. Python i C# potrzebują tylko podstawowego workera edytora.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

export default function CodeEditorMonaco(props: CodeEditorProps & { height: number }) {
  const { resolved } = useTheme()
  // Skrót rejestrujemy raz przy starcie edytora — ref trzyma zawsze najnowszą funkcję z props
  const onCtrlEnter = useRef(props.onCtrlEnter)
  useEffect(() => {
    onCtrlEnter.current = props.onCtrlEnter
  })
  return (
    <Editor
      height={props.height}
      language={props.language}
      value={props.value}
      onChange={(value) => props.onChange(value ?? "")}
      theme={resolved === "dark" ? "vs-dark" : "vs"}
      onMount={(editor) => {
        // Skrót tylko dla TEGO edytora. editor.addCommand rejestruje go globalnie dla wszystkich
        // edytorów na stronie (wygrywa ostatni) — edytor z rozwiązaniem przejmowałby Ctrl+Enter.
        // Nasłuch znika razem z edytorem. Bez onCtrlEnter zdarzenie idzie dalej (np. do strony).
        editor.onKeyDown((e) => {
          if (!onCtrlEnter.current || !(e.ctrlKey || e.metaKey) || e.keyCode !== monaco.KeyCode.Enter) return
          e.preventDefault()
          e.stopPropagation()
          onCtrlEnter.current()
        })
      }}
      options={{
        ariaLabel: props.ariaLabel,
        readOnly: props.readOnly,
        minimap: { enabled: false },
        fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 20,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 10, bottom: 10 },
        renderLineHighlight: "none",
      }}
    />
  )
}
