"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the current server page periodically (used while a document is being extracted). */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
