import { BrowserRouter, Route, Routes } from "react-router"
import { AppLayout } from "@/components/AppLayout"
import Pulpit from "@/pages/Pulpit"
import Sesja from "@/pages/Sesja"
import Statystyki from "@/pages/Statystyki"
import Ustawienia from "@/pages/Ustawienia"
import ZadanieForm from "@/pages/ZadanieForm"
import Zadania from "@/pages/Zadania"
import { ThemeProvider } from "@/theme"

// Wszystkie ekrany aplikacji (spec §6 „Trasy”)
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Pulpit />} />
        <Route path="/zadania" element={<Zadania />} />
        <Route path="/zadania/nowe" element={<ZadanieForm />} />
        <Route path="/zadania/:id/edycja" element={<ZadanieForm />} />
        <Route path="/sesja" element={<Sesja />} />
        <Route path="/statystyki" element={<Statystyki />} />
        <Route path="/ustawienia" element={<Ustawienia />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  )
}
