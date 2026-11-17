"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-warning" aria-hidden />
      <h1 className="text-lg font-semibold">Noget gik galt</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Siden kunne ikke vises. Prøv igen – hvis fejlen bliver ved, så genindlæs siden eller kontakt
        support.
      </p>
      <Button onClick={reset}>
        <RotateCcw aria-hidden /> Prøv igen
      </Button>
    </div>
  );
}
