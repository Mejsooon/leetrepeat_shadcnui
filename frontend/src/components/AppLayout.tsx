import { Outlet, useLocation } from "react-router"
import { AppSidebar } from "@/components/AppSidebar"
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
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader crumbs={crumbsFor(pathname)} />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
