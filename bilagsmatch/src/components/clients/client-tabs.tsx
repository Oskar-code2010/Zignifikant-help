"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "bilag", label: "Bilag" },
  { slug: "bank", label: "Bank" },
  { slug: "afstemning", label: "Afstemning" },
  { slug: "eksport", label: "Eksport" },
  { slug: "mangler-bilag", label: "Mangler bilag" },
];

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Klientfaner" className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = `/klienter/${clientId}/${t.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={t.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
