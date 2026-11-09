import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// Motyw: jasny, ciemny albo „jak system”. Wybór trzymamy w localStorage przeglądarki.
export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "leetrepeat-theme"
const SYSTEM_DARK = "(prefers-color-scheme: dark)"

type ThemeState = {
  theme: Theme
  resolved: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Zapisany wybór; localStorage może być zablokowany (tryb prywatny) — wtedy motyw systemowy
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === "light" || saved === "dark" || saved === "system") return saved
    } catch {
      // brak dostępu do localStorage
    }
    return "system"
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_DARK).matches)

  // Śledzimy zmianę motywu systemu, żeby tryb „system” przełączał się bez odświeżania
  useEffect(() => {
    const media = window.matchMedia(SYSTEM_DARK)
    const onChange = (e: { matches: boolean }) => setSystemDark(e.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme

  // Klasa .dark na <html> włącza ciemne tokeny z index.css
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark")
  }, [resolved])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // nie da się zapisać — motyw działa do zamknięcia karty
    }
  }

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext)
  if (!value) throw new Error("useTheme musi być użyty wewnątrz <ThemeProvider>")
  return value
}
