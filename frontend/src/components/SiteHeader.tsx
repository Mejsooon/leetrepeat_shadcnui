import { ChevronRight } from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

// Pasek nad treścią: przycisk panelu, ścieżka „LeetRepeat › …” i status zapisu po prawej
export function SiteHeader({ crumbs, status }: { crumbs: string[]; status?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger aria-label="Przełącz panel boczny" />
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
      <nav aria-label="Ścieżka" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            <span className={i === crumbs.length - 1 ? "text-foreground" : undefined}>{crumb}</span>
          </Fragment>
        ))}
      </nav>
      <div className="flex-1" />
      {status}
    </header>
  )
}
