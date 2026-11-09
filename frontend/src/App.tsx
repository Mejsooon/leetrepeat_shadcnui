import { BrowserRouter, Route, Routes } from "react-router"
import Pulpit from "@/pages/Pulpit"
import Sesja from "@/pages/Sesja"
import Statystyki from "@/pages/Statystyki"
import Ustawienia from "@/pages/Ustawienia"
import ZadanieForm from "@/pages/ZadanieForm"
import Zadania from "@/pages/Zadania"

// Wszystkie ekrany aplikacji (spec §6 „Trasy”)
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Pulpit />} />
      <Route path="/zadania" element={<Zadania />} />
      <Route path="/zadania/nowe" element={<ZadanieForm />} />
      <Route path="/zadania/:id/edycja" element={<ZadanieForm />} />
      <Route path="/sesja" element={<Sesja />} />
      <Route path="/statystyki" element={<Statystyki />} />
      <Route path="/ustawienia" element={<Ustawienia />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
