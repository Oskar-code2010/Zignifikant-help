"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError, errorMessage } from "@/lib/client/api";
import { formatDKK } from "@/lib/money";
import { formatDate } from "@/lib/dates";

interface Entry {
  id: string;
  date: string;
  voucherNumber: number;
  text: string;
  accountNumber: string;
  vatCode: string;
  amountOre: number;
  exported: boolean;
  exportedAt: string | null;
}

interface Preview {
  entries: Entry[];
  newCount: number;
  exportedCount: number;
}

export function ExportPanel({
  clientId,
  counterAccount,
}: {
  clientId: string;
  counterAccount: string;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState<"generic" | "economic" | "dinero">("generic");
  const [includeExported, setIncludeExported] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/export?from=${from}&to=${to}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Kunne ikke hente kladdeposteringer.");
      setPreview((await res.json()) as Preview);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [clientId, from, to]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function doExport() {
    setPending(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to, preset, includeExported }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new ApiError(res.status, body?.error ?? "Eksporten fejlede.", body);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "kassekladde.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${res.headers.get("x-export-count") ?? ""} posteringer eksporteret.`);
      setIncludeExported(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const visible = preview?.entries.filter((e) => includeExported || !e.exported) ?? [];
  const total = visible.reduce((s, e) => s + e.amountOre, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Eksportér kassekladde</CardTitle>
        <CardDescription>
          CSV med semikolon, decimalkomma, datoer som dd-mm-åååå og UTF-8 med BOM. Modkonto:{" "}
          {counterAccount}. Kontrollér altid formatet mod dit regnskabsprograms aktuelle
          importvejledning.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="exp-from">Fra dato</Label>
            <Input
              id="exp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="exp-to">Til dato</Label>
            <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="exp-preset">Format</Label>
            <Select
              id="exp-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as typeof preset)}
            >
              <option value="generic">Generisk kassekladde</option>
              <option value="economic">e-conomic-kompatibel</option>
              <option value="dinero">Dinero-kompatibel</option>
            </Select>
          </div>
          <Button onClick={() => void doExport()} disabled={pending || visible.length === 0}>
            <Download aria-hidden /> Eksportér CSV ({visible.length})
          </Button>
        </div>

        {preview && preview.exportedCount > 0 ? (
          <div
            className="flex flex-col gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning"
            role="status"
          >
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {preview.exportedCount} posteringer i perioden er allerede eksporteret.
            </p>
            <label className="flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={includeExported}
                onChange={(e) => setIncludeExported(e.target.checked)}
                className="h-4 w-4"
              />
              Medtag allerede eksporterede (risiko for dobbeltbogføring)
            </label>
          </div>
        ) : null}

        {preview === null ? (
          <p className="text-sm text-muted-foreground">Henter…</p>
        ) : visible.length === 0 ? (
          <EmptyState title="Ingen nye kladdeposteringer">
            Posteringer oprettes, når du bekræfter match under Afstemning. Allerede eksporterede
            posteringer vises kun, hvis du vælger at medtage dem.
          </EmptyState>
        ) : (
          <Table data-testid="export-preview">
            <THead>
              <TR>
                <TH>Dato</TH>
                <TH>Bilag</TH>
                <TH>Tekst</TH>
                <TH>Konto</TH>
                <TH>Moms</TH>
                <TH className="text-right">Beløb</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((e) => (
                <TR key={e.id}>
                  <TD className="tabular">{formatDate(new Date(e.date))}</TD>
                  <TD className="tabular">{e.voucherNumber}</TD>
                  <TD>{e.text}</TD>
                  <TD className="tabular">{e.accountNumber}</TD>
                  <TD>{e.vatCode}</TD>
                  <TD className="tabular whitespace-nowrap text-right">{formatDKK(e.amountOre)}</TD>
                  <TD>
                    {e.exported ? (
                      <Badge variant="muted">Eksporteret</Badge>
                    ) : (
                      <Badge variant="success">Ny</Badge>
                    )}
                  </TD>
                </TR>
              ))}
              <TR>
                <TD colSpan={5} className="text-right font-medium">
                  I alt
                </TD>
                <TD className="tabular whitespace-nowrap text-right font-medium">
                  {formatDKK(total)}
                </TD>
                <TD />
              </TR>
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
