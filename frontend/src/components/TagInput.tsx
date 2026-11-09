import { X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

// Pole tagów: Enter lub przecinek dodaje tag, × usuwa, podpowiedzi z tagów już użytych w bibliotece
export function TagInput({ value, onChange, suggestions }: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}) {
  const [text, setText] = useState("")

  function add(name: string) {
    const tag = name.trim()
    // Ten sam tag niezależnie od wielkości liter dodajemy tylko raz
    if (tag && !value.some((t) => t.toLocaleLowerCase("pl") === tag.toLocaleLowerCase("pl"))) {
      onChange([...value, tag])
    }
    setText("")
  }

  const typed = text.trim().toLocaleLowerCase("pl")
  const matches = typed
    ? suggestions.filter((s) => s.toLocaleLowerCase("pl").includes(typed)
        && !value.some((t) => t.toLocaleLowerCase("pl") === s.toLocaleLowerCase("pl"))).slice(0, 6)
    : []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              aria-label={`Usuń tag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded-sm opacity-70 hover:opacity-100"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <Input
          aria-label="Dodaj tag"
          placeholder={value.length ? "" : "np. Tablice, Stos…"}
          value={text}
          onChange={(e) => {
            if (e.target.value.endsWith(",")) add(e.target.value.slice(0, -1))
            else setText(e.target.value)
          }}
          // Tag wpisany bez Entera nie ginie — dodajemy go przy wyjściu z pola (np. klik „Zapisz”)
          onBlur={() => text.trim() && add(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(text)
            }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
          }}
          className="h-6 min-w-24 flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
        />
      </div>
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Podpowiedzi tagów" className="flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <li key={s} role="option" aria-selected="false" tabIndex={0} onClick={() => add(s)}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={(e) => e.key === "Enter" && add(s)}
              className="cursor-pointer rounded-md border px-2 py-0.5 text-xs hover:bg-accent">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
