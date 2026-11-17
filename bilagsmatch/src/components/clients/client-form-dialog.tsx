"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client/api";

interface ClientValues {
  id?: string;
  name: string;
  cvr: string;
  notes: string;
  bankLedgerAccount: string;
}

export function ClientFormDialog({
  trigger,
  initial,
}: {
  trigger: React.ReactNode;
  initial?: ClientValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [cvrError, setCvrError] = useState<string | null>(null);
  const editing = Boolean(initial?.id);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cvr = String(f.get("cvr") ?? "");
    const digits = cvr.replace(/^\s*dk/i, "").replace(/[\s-]/g, "");
    if (!/^\d{8}$/.test(digits)) {
      setCvrError("CVR-nummer skal være 8 cifre.");
      return;
    }
    setCvrError(null);
    setPending(true);
    try {
      const payload = {
        name: String(f.get("name") ?? ""),
        cvr,
        notes: String(f.get("notes") ?? ""),
        bankLedgerAccount: String(f.get("bankLedgerAccount") ?? "5810"),
      };
      if (editing && initial?.id) {
        await apiFetch(`/api/clients/${initial.id}`, { method: "PATCH", json: payload });
        toast.success("Klienten er opdateret.");
      } else {
        const res = await apiFetch<{ client: { id: string } }>("/api/clients", {
          method: "POST",
          json: payload,
        });
        toast.success("Klienten er oprettet.");
        router.push(`/klienter/${res.client.id}/bilag`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Rediger klient" : "Opret klient"}</DialogTitle>
          <DialogDescription>
            Klienten er den virksomhed, du fører bogholderi for.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-name">Navn</Label>
            <Input
              id="client-name"
              name="name"
              required
              defaultValue={initial?.name}
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-cvr">CVR-nummer</Label>
            <Input
              id="client-cvr"
              name="cvr"
              required
              inputMode="numeric"
              defaultValue={initial?.cvr}
              aria-invalid={cvrError ? true : undefined}
              aria-describedby={cvrError ? "client-cvr-error" : undefined}
            />
            {cvrError ? (
              <p id="client-cvr-error" className="text-sm text-danger">
                {cvrError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-ledger">Bankkonto i kontoplanen (modkonto ved eksport)</Label>
            <Input
              id="client-ledger"
              name="bankLedgerAccount"
              inputMode="numeric"
              defaultValue={initial?.bankLedgerAccount ?? "5810"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-notes">Noter</Label>
            <Textarea id="client-notes" name="notes" defaultValue={initial?.notes} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Gemmer…" : editing ? "Gem ændringer" : "Opret klient"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
