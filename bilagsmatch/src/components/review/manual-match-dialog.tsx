"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
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
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountOption, CandidateDoc, VatOption } from "./types";

export function ManualMatchDialog({
  clientId,
  open,
  onOpenChange,
  transaction,
  accounts,
  vatCodes,
  onMatched,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction: { id: string; text: string; amountOre: number; bookingDate: string };
  accounts: AccountOption[];
  vatCodes: VatOption[];
  onMatched: () => void;
}) {
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<CandidateDoc[] | null>(null);
  const [selected, setSelected] = useState<CandidateDoc | null>(null);
  const [account, setAccount] = useState("");
  const [vat, setVat] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(
        `/api/clients/${clientId}/transactions/${transaction.id}/candidates?q=${encodeURIComponent(q)}`,
        {
          signal: ctrl.signal,
        },
      )
        .then(async (r) => {
          if (!r.ok) throw new Error("Søgningen fejlede.");
          const body = (await r.json()) as { documents: CandidateDoc[] };
          setDocs(body.documents);
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) toast.error(errorMessage(e));
        });
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, q, clientId, transaction.id]);

  function choose(d: CandidateDoc) {
    setSelected(d);
    setAccount(d.suggestedAccount ?? "");
    setVat(d.suggestedVatCode ?? "");
  }

  async function onSubmit() {
    if (!selected) return;
    if (!account || !vat) {
      toast.error("Vælg konto og momskode.");
      return;
    }
    setPending(true);
    try {
      await apiFetch(`/api/clients/${clientId}/matches/manual`, {
        method: "POST",
        json: {
          transactionId: transaction.id,
          documentId: selected.id,
          accountNumber: account,
          vatCode: vat,
        },
      });
      toast.success("Manuelt match gemt og bogført i kladden.");
      onMatched();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find bilag manuelt</DialogTitle>
          <DialogDescription>
            {transaction.text} · <span className="tabular">{formatDKK(transaction.amountOre)}</span>{" "}
            · {formatDate(new Date(transaction.bookingDate))}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="manual-search">Søg på leverandør, fakturanr., filnavn eller beløb</Label>
          <Input
            id="manual-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="fx postnord eller 89,95"
            autoFocus
          />
        </div>
        <ul
          className="flex max-h-72 flex-col gap-1 overflow-y-auto"
          aria-label="Bilag"
          data-testid="manual-candidates"
        >
          {docs === null ? (
            <li className="text-sm text-muted-foreground">Søger…</li>
          ) : docs.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              Ingen uafstemte bilag matcher søgningen.
            </li>
          ) : (
            docs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => choose(d)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected?.id === d.id
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {d.supplierName ?? d.originalFilename}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {d.invoiceNumber ? `Nr. ${d.invoiceNumber} · ` : ""}
                      {d.invoiceDate ? formatDate(new Date(d.invoiceDate)) : "ukendt dato"}
                    </span>
                  </span>
                  <span className="tabular shrink-0">
                    {d.totalAmountOre === null
                      ? "–"
                      : d.currency && d.currency !== "DKK"
                        ? `${formatDKK(d.totalAmountOre).replace(" kr.", "")} ${d.currency}`
                        : formatDKK(d.totalAmountOre)}
                  </span>
                  {d.score !== null ? (
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                      {d.score}
                    </span>
                  ) : (
                    <span className="w-10" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        {selected ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-account">Konto</Label>
              <Select
                id="manual-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">– vælg konto –</option>
                {accounts.map((a) => (
                  <option key={a.number} value={a.number}>
                    {a.number} {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-vat">Momskode</Label>
              <Select id="manual-vat" value={vat} onChange={(e) => setVat(e.target.value)}>
                <option value="">– vælg momskode –</option>
                {vatCodes.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.code} – {v.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button onClick={() => void onSubmit()} disabled={!selected || pending}>
            {pending ? "Gemmer…" : "Match og bekræft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
