// Atrapa window.matchMedia dla jsdom: pozwala ustawić „ciemny system” i zasymulować jego zmianę
type Listener = (e: { matches: boolean }) => void

export function mockMatchMedia(prefersDark: boolean) {
  const listeners: Listener[] = []
  let dark = prefersDark
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("dark") ? dark : false
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: Listener) => listeners.push(l),
    removeEventListener: (_: string, l: Listener) => listeners.splice(listeners.indexOf(l), 1),
    addListener: (l: Listener) => listeners.push(l),
    removeListener: (l: Listener) => listeners.splice(listeners.indexOf(l), 1),
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia
  return {
    setSystemDark(value: boolean) {
      dark = value
      for (const l of [...listeners]) l({ matches: value })
    },
  }
}
