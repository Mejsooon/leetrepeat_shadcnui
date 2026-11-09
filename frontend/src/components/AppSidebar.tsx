import {
  ChartColumn,
  Code,
  Flame,
  HardDrive,
  LayoutDashboard,
  Monitor,
  Moon,
  Repeat,
  Settings,
  Sun,
} from "lucide-react"
import { Link, useLocation } from "react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useTheme, type Theme } from "@/theme"

// Panel boczny 1:1 z artboardu AppSidebar.dc.html.
// taskCount i streak przyjdą z API w Etapach 2 i 4 — bez nich licznik i karta serii się nie pokazują.
export function AppSidebar({ taskCount, streak }: { taskCount?: number; streak?: number }) {
  const { pathname } = useLocation()
  const { theme, setTheme } = useTheme()

  // Który element menu jest aktywny: sesja i formularze należą do „Zadań”
  let active = "pulpit"
  if (pathname.startsWith("/zadania") || pathname.startsWith("/sesja")) active = "zadania"
  if (pathname.startsWith("/statystyki")) active = "statystyki"
  if (pathname.startsWith("/ustawienia")) active = "ustawienia"

  const learning = [
    { id: "pulpit", label: "Pulpit", to: "/", icon: LayoutDashboard },
    { id: "zadania", label: "Zadania", to: "/zadania", icon: Code },
    { id: "statystyki", label: "Statystyki", to: "/statystyki", icon: ChartColumn },
  ]
  const themes: { id: Theme; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Motyw jasny", icon: Sun },
    { id: "dark", label: "Motyw ciemny", icon: Moon },
    { id: "system", label: "Motyw systemowy", icon: Monitor },
  ]

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2.5 rounded-md p-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Repeat className="size-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-semibold">LeetRepeat</span>
            <span className="text-xs text-muted-foreground">Lokalna praktyka</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Nauka</SidebarGroupLabel>
          <SidebarMenu>
            {learning.map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild isActive={active === item.id}>
                  <Link to={item.to} aria-current={active === item.id ? "page" : undefined}>
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {item.id === "zadania" && taskCount !== undefined && (
                  <SidebarMenuBadge className="tabular-nums">{taskCount}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Aplikacja</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={active === "ustawienia"}>
                <Link to="/ustawienia" aria-current={active === "ustawienia" ? "page" : undefined}>
                  <Settings aria-hidden="true" />
                  <span>Ustawienia</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {streak !== undefined && (
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-xs">
            <span className="flex items-center justify-between text-sm font-medium">
              Małe kroki, codziennie
              <Flame className="size-4 text-warning" aria-hidden="true" />
            </span>
            <span className="text-xs text-muted-foreground">Twoja seria trwa już {streak} dni.</span>
          </div>
        )}
        <div className="flex gap-2 px-2 pt-1 text-xs text-muted-foreground">
          <HardDrive className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-medium text-foreground">Tylko na tym urządzeniu</span>
            Zadania i postępy zapisujesz lokalnie. Bez konta.
          </span>
        </div>
        <div role="radiogroup" aria-label="Motyw" className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-[3px]">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              aria-label={t.label}
              title={t.label}
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex h-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
                theme === t.id && "bg-background text-foreground shadow-sm",
              )}
            >
              <t.icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
