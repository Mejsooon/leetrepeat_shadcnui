import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router"
import { listTasks } from "@/api"
import { AppSidebar } from "@/components/AppSidebar"
import { ConnectionBanner } from "@/components/ConnectionBanner"
import { SiteHeader } from "@/components/SiteHeader"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

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

// Wspólny układ: panel boczny + nagłówek + treść ekranu
export function AppLayout() {
  const { pathname } = useLocation()
  const [taskCount, setTaskCount] = useState<number | undefined>(undefined)

  // Licznik przy „Zadania” — odświeżany po każdej zmianie ekranu (np. po dodaniu albo usunięciu zadania)
  useEffect(() => {
    listTasks({ page: 1 })
      .then((list) => setTaskCount(list.counts.library))
      .catch(() => setTaskCount(undefined))
  }, [pathname])

  return (
    <SidebarProvider>
      <AppSidebar taskCount={taskCount} />
      <SidebarInset>
        <SiteHeader crumbs={crumbsFor(pathname)} />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
          <ConnectionBanner />
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
