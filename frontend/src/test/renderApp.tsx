import { render } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { routes } from "@/App"
import { mockMatchMedia } from "@/test/matchMedia"
import { ThemeProvider } from "@/theme"

// Cała aplikacja (z panelem bocznym) otwarta pod podanym adresem — do testów ekranów
export function renderApp(path: string) {
  mockMatchMedia(false)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return { ...result, router }
}

// Atrapa fetch: odpowiedź wybierana po początku adresu, np. { "/api/tasks?": {...}, "/api/tags": [...] }
export function stubApi(routesMap: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const key = Object.keys(routesMap)
      .sort((a, b) => b.length - a.length)
      .find((k) => url.startsWith(k))
    if (key === undefined) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })
    const value = routesMap[key]
    if (value instanceof Response) return value.clone()
    return new Response(JSON.stringify(value), { status: 200 })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

export const EMPTY_LIST = { items: [], total: 0, page: 1, pages: 1, counts: { library: 0, due: 0, new: 0 } }
