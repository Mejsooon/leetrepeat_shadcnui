import { createContext, useContext, type ReactNode } from "react"

// Ekran może podmienić status po prawej stronie nagłówka (np. „Zmiany niezapisane”).
// null = domyślny status „Zapisano lokalnie”.
export const HeaderStatusContext = createContext<(node: ReactNode | null) => void>(() => {})

export function useHeaderStatus() {
  return useContext(HeaderStatusContext)
}
