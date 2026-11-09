import { useParams } from "react-router"

// Formularz zadania: /zadania/nowe (dodawanie) i /zadania/:id/edycja (edycja)
export default function ZadanieForm() {
  const { id } = useParams()
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl font-semibold tracking-tight">{id ? "Edytuj zadanie" : "Dodaj zadanie"}</h1>
    </div>
  )
}
