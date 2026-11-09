import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router"
import { AppLayout } from "@/components/AppLayout"
import Pulpit from "@/pages/Pulpit"
import Sesja from "@/pages/Sesja"
import Statystyki from "@/pages/Statystyki"
import Ustawienia from "@/pages/Ustawienia"
import ZadanieForm from "@/pages/ZadanieForm"
import Zadania from "@/pages/Zadania"
import { ThemeProvider } from "@/theme"

// Wszystkie ekrany aplikacji (spec §6 „Trasy”), wspólny układ z panelem bocznym.
// „Data router” (createBrowserRouter) jest potrzebny do pytania o niezapisane zmiany (useBlocker).
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Pulpit /> },
      { path: "/zadania", element: <Zadania /> },
      { path: "/zadania/nowe", element: <ZadanieForm /> },
      { path: "/zadania/:id/edycja", element: <ZadanieForm /> },
      { path: "/sesja", element: <Sesja /> },
      { path: "/statystyki", element: <Statystyki /> },
      { path: "/ustawienia", element: <Ustawienia /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
