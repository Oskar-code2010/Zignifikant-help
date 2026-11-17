"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatAmountInput, tryParseDanishAmount } from "@/lib/money";

export interface EditableDoc {
  id: string;
  clientId: string;
  status: string;
  supplierName: string | null;
  supplierCvr: string | null;
  invoiceNumber: string | null;
  invoiceDate: string; // yyyy-mm-dd or ""
  dueDate: string;
  totalAmountOre: number | null;
  vatAmountOre: number | null;
  netAmountOre: number | null;
  currency: string | null;
  description: string | null;
  isCreditNote: boolean;
}

export function DocumentEditor({ doc }: { doc: EditableDoc }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nextErrors: Record<string, string> = {};
    const amount = (name: string) => {
      const raw = String(f.get(name) ?? "").trim();
      if (raw === "") return null;
      const v = tryParseDanishAmount(raw);
      if (v === null) nextErrors[name] = "Ugyldigt beløb, fx 1.234,56";
      return v;
    };
    const payload = {
      supplierName: String(f.get("supplierName") ?? ""),
      supplierCvr: String(f.get("supplierCvr") ?? ""),
      invoiceNumber: String(f.get("invoiceNumber") ?? ""),
      invoiceDate: String(f.get("invoiceDate") ?? "") || null,
      dueDate: String(f.get("dueDate") ?? "") || null,
      totalAmountOre: amount("totalAmountOre"),
      vatAmountOre: amount("vatAmountOre"),
      netAmountOre: amount("netAmountOre"),
      currency: String(f.get("currency") ?? "").trim() || null,
      description: String(f.get("description") ?? ""),
      isCreditNote: f.get("isCreditNote") === "on",
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setPending(true);
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "PATCH", json: payload });
      toast.success("Bilaget er gemt.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onRetry() {
    try {
      await apiFetch(`/api/documents/${doc.id}/retry`, { method: "POST" });
      toast.success("Bilaget er sat i kø til ny aflæsning.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function onDelete() {
    if (!window.confirm("Slet bilaget permanent?")) return;
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      toast.success("Bilaget er slettet.");
      router.push(`/klienter/${doc.clientId}/bilag`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const field = (name: keyof EditableDoc, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`doc-${name}`}>{label}</Label>
      <Input
        id={`doc-${name}`}
        name={name}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `doc-${name}-err` : undefined}
        {...props}
      />
      {errors[name] ? (
        <p id={`doc-${name}-err`} className="text-xs text-danger">
          {errors[name]}
        </p>
      ) : null}
    </div>
  );

  const busy = doc.status === "UPLOADED" || doc.status === "EXTRACTING";

  return (
    <form onSubmit={onSave} className="flex flex-col gap-3" noValidate>
      {field("supplierName", "Leverandør", { defaultValue: doc.supplierName ?? "" })}
      <div className="grid grid-cols-2 gap-3">
        {field("supplierCvr", "Leverandør-CVR", { defaultValue: doc.supplierCvr ?? "", inputMode: "numeric" })}
        {field("invoiceNumber", "Fakturanr.", { defaultValue: doc.invoiceNumber ?? "" })}
        {field("invoiceDate", "Fakturadato", { type: "date", defaultValue: doc.invoiceDate })}
        {field("dueDate", "Forfaldsdato", { type: "date", defaultValue: doc.dueDate })}
        {field("totalAmountOre", "Total inkl. moms", {
          defaultValue: formatAmountInput(doc.totalAmountOre),
          inputMode: "decimal",
          className: "tabular text-right",
        })}
        {field("vatAmountOre", "Moms", {
          defaultValue: formatAmountInput(doc.vatAmountOre),
          inputMode: "decimal",
          className: "tabular text-right",
        })}
        {field("netAmountOre", "Netto ekskl. moms", {
          defaultValue: formatAmountInput(doc.netAmountOre),
          inputMode: "decimal",
          className: "tabular text-right",
        })}
        {field("currency", "Valuta", { defaultValue: doc.currency ?? "DKK", maxLength: 3 })}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="doc-description">Beskrivelse</Label>
        <Textarea id="doc-description" name="description" defaultValue={doc.description ?? ""} rows={3} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isCreditNote" defaultChecked={doc.isCreditNote} className="h-4 w-4" />
        Kreditnota (beløb er en kreditering)
      </label>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={pending || busy}>
          <Save aria-hidden /> {pending ? "Gemmer…" : "Gem"}
        </Button>
        <Button type="button" variant="outline" onClick={onRetry} disabled={busy}>
          <RotateCcw aria-hidden /> Aflæs igen
        </Button>
        <Button type="button" variant="ghost" className="text-danger" onClick={onDelete}>
          <Trash2 aria-hidden /> Slet
        </Button>
      </div>
    </form>
  );
}
