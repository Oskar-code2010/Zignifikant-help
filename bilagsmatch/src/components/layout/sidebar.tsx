"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Building2, LayoutDashboard, ListChecks, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overblik", icon: LayoutDashboard, exact: true },
  { href: "/klienter", label: "Klienter", icon: Building2 },
  { href: "/regler", label: "Regler", icon: ListChecks },
  { href: "/kontoplan", label: "Kontoplan", icon: BookOpen },
  { href: "/indstillinger", label: "Indstillinger", icon: Settings },
];

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/" className="text-lg font-semibold tracking-tight text-primary">
          Bilagsmatch
        </Link>
      </div>
      <nav aria-label="Hovedmenu" className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{orgName}</div>
    </aside>
  );
}
