import { CircleCheck } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Outlet, useLocation } from "react-router"
import { getDashboard } from "@/api"
import { AppSidebar } from "@/components/AppSidebar"
import { ConnectionBanner } from "@/components/ConnectionBanner"
import { SiteHeader } from "@/components/SiteHeader"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { HeaderStatusContext } from "@/headerStatus"

// Ścieżka w nagłówku dla każdego ekranu
function crumbsFor(pathname: string): string[] {
  if (pathname === "/zadania/nowe") return ["Zadania", "Dodaj zadanie"]
  if (pathname.startsWith("/zadania/")) return ["Zadania", "Edytuj"]
  if (pathname.startsWith("/zadania")) return ["LeetRepeat", "Zadania"]
  if (pathname.startsWith("/sesja")) return ["Powtórka"]
  if (pathname.startsWith("/statystyki")) return ["LeetRepeat", "Statystyki"]
  if (pathname.startsWith("/ustawienia")) return ["LeetRepeat", "Ustawienia"]
  return ["LeetRepeat", "Pulpit"]
}

const SAVED_LOCALLY = (
  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
    <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
    Zapisano lokalnie
  </span>
)

// Wspólny układ: panel boczny + nagłówek + treść ekranu
export function AppLayout() {
  const { pathname } = useLocation()
  const [taskCount, setTaskCount] = useState<number | undefined>(undefined)
  const [streak, setStreak] = useState<number | undefined>(undefined)
  const [status, setStatus] = useState<ReactNode | null>(null)

  // Licznik przy „Zadania” i seria dni — odświeżane po każdej zmianie ekranu
  // (np. po dodaniu zadania albo po zakończonej sesji)
  useEffect(() => {
    getDashboard()
      .then((d) => {
        setTaskCount(d.library_count)
        setStreak(d.streak)
      })
      .catch(() => {
        setTaskCount(undefined)
        setStreak(undefined)
      })
  }, [pathname])

  return (
    <HeaderStatusContext.Provider value={setStatus}>
      <SidebarProvider>
        <AppSidebar taskCount={taskCount} streak={streak} />
        <SidebarInset>
          <SiteHeader crumbs={crumbsFor(pathname)} status={status ?? SAVED_LOCALLY} />
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
            <ConnectionBanner />
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </HeaderStatusContext.Provider>
  )
}
