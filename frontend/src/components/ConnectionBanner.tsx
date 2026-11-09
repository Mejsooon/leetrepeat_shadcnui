import { RotateCcw, ServerOff } from "lucide-react"
import { useEffect, useState } from "react"
import { ApiError, getHealth } from "@/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

// Baner nad treścią, gdy serwer (python main.py) nie odpowiada
export function ConnectionBanner() {
  const [offline, setOffline] = useState(false)
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    try {
      await getHealth()
      setOffline(false)
    } catch (error) {
      // Tylko brak połączenia (status 0) — inne błędy obsługują same ekrany
      setOffline(error instanceof ApiError && error.status === 0)
    }
    setChecking(false)
  }

  useEffect(() => {
    check()
  }, [])

  if (!offline) return null

  return (
    <Alert variant="destructive" className="flex items-center gap-3">
      <ServerOff aria-hidden="true" />
      <div className="flex-1">
        <AlertTitle>Nie można połączyć się z aplikacją</AlertTitle>
        <AlertDescription>
          <span>
            Czy działa <code className="font-mono">python main.py</code>?
          </span>
        </AlertDescription>
      </div>
      <Button variant="outline" size="sm" onClick={check} disabled={checking}>
        <RotateCcw aria-hidden="true" />
        Spróbuj ponownie
      </Button>
    </Alert>
  )
}
