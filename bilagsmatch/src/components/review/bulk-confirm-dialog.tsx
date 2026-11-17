"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatDKK } from "@/lib/money";

interface Preview {
  count: number;
  totalOre: number;
  skippedWithoutAccount: number;
}

export function BulkConfirmDialog({
  clientId,
  open,
  onOpenChange,
  onDone,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);

  async function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setPreview(null);
      return;
    }
  }

  async function load() {
    try {
      setPreview(await apiFetch<Preview>(`/api/clients/${clientId}/matches/bulk-confirm`));
    } catch (err) {
      toast.error(errorMessage(err));
      onOpenChange(false);
    }
  }

  async function onConfirm() {
    setPending(true);
    try {
      const res = await apiFetch<{ confirmed: number }>(`/api/clients/${clientId}/matches/bulk-confirm`, { method: "POST" });
      toast.success(`${res.confirmed} match bekræftet.`);
      onOpenChange(false);
      setPreview(null);
      await onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => void handleOpenChange(o)}>
      <DialogContent onOpenAutoFocus={() => void load()}>
        <DialogHeader>
          <DialogTitle>Bekræft alle med høj sikkerhed</DialogTitle>
          <DialogDescription>Alle forslag med score 85 eller mere og et kontoforslag bliver bekræftet og bogført i kladden.</DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="flex flex-col gap-2 text-sm" data-testid="bulk-preview">
            <p>
              <strong>{preview.count}</strong> match for i alt <strong className="tabular">{formatDKK(preview.totalOre)}</strong> bliver bekræftet.
            </p>
            {preview.skippedWithoutAccount > 0 ? (
              <p className="text-warning">
                {preview.skippedWithoutAccount} forslag uden kontoforslag springes over – de skal bekræftes enkeltvis.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Henter…</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button variant="success" onClick={() => void onConfirm()} disabled={!preview || preview.count === 0 || pending}>
            {pending ? "Bekræfter…" : `Bekræft ${preview?.count ?? ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
