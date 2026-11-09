// Klawisz skrótów: ⌘ na Macu, Ctrl na Windows i Linuxie
export function modKey(): "⌘" | "Ctrl" {
  const text = `${navigator.platform} ${navigator.userAgent}`
  return text.includes("Mac") ? "⌘" : "Ctrl"
}
