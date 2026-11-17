"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatDKK } from "@/lib/money";
import { MAPPING_LABELS, type ColumnMapping } from "@/lib/bank-csv/types";

type Options = {
  delimiter: ";" | "," | "\t";
  decimal: "," | ".";
  dateFormat: string;
  headerRowIndex: number;
  mapping: ColumnMapping;
};

interface PreviewResponse {
  detection: { encodingLabel: string; formatName: string };
  options: Options;
  headers: string[];
  preview: { line: number; bookingDate: string; text: string; amountOre: number; balanceOre: number | null }[];
  totals: { rows: number; failed: number; skipped: number };
  failed: { line: number; reason: string }[];
}

interface ImportResponse {
  imported: number;
  duplicates: number;
  failed: { line: number; reason: string }[];
}

const FIELDS: (keyof ColumnMapping)[] = [
  "bookingDate",
  "text",
  "amount",
  "debit",
  "credit",
  "balance",
  "valueDate",
  "currency",
];

export function BankImport({
  clientId,
  bankAccounts,
}: {
  clientId: string;
  bankAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [account, setAccount] = useState<string>(bankAccounts[0]?.id ?? "__new");
  const [newName, setNewName] = useState("Bankkonto");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function loadPreview(f: File, opts?: Options) {
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (opts) fd.append("options", JSON.stringify(opts));
      const res = await apiFetch<PreviewResponse>(`/api/clients/${clientId}/bank/preview`, {
        method: "POST",
        body: fd,
      });
      setPreview(res);
      setOptions(res.options);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("CSV-filen er for stor (maks. 5 MB).");
      return;
    }
    setFile(f);
    setResult(null);
    void loadPreview(f);
  }

  function update(next: Options) {
    setOptions(next);
    if (file) void loadPreview(file, next);
  }

  function setMapping(field: keyof ColumnMapping, value: string) {
    if (!options) return;
    const idx = value === "" ? null : Number(value);
    const mapping = { ...options.mapping, [field]: idx };
    if (field === "amount" && idx !== null) {
      mapping.debit = null;
      mapping.credit = null;
    }
    if ((field === "debit" || field === "credit") && idx !== null) mapping.amount = null;
    update({ ...options, mapping });
  }

  async function doImport() {
    if (!file || !options) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "options",
        JSON.stringify({
          ...options,
          ...(account === "__new" ? { newBankAccountName: newName } : { bankAccountId: account }),
        }),
      );
      const res = await apiFetch<ImportResponse>(`/api/clients/${clientId}/bank/import`, {
        method: "POST",
        body: fd,
      });
      setResult(res);
      setPreview(null);
      setFile(null);
      toast.success(`${res.imported} posteringer importeret.`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importér bankudtog</CardTitle>
        <CardDescription>
          Upload en CSV-fil fra netbanken. Format, kolonner, datoformat og tegnsæt genkendes automatisk – du kan rette
          det, før du importerer. Allerede importerede posteringer springes over.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="sr-only"
            id="bank-csv-input"
            data-testid="bank-csv-input"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
            <FileUp aria-hidden /> Vælg CSV-fil
          </Button>
          <span className="text-sm text-muted-foreground">{file ? file.name : "Ingen fil valgt"}</span>
        </div>

        {preview && options ? (
          <div className="flex flex-col gap-4" data-testid="bank-preview">
            <p className="text-sm">
              <strong>{preview.detection.formatName}</strong> · {preview.detection.encodingLabel} ·{" "}
              {preview.totals.rows} gyldige rækker
              {preview.totals.failed > 0 ? `, ${preview.totals.failed} med fejl` : ""}
              {preview.totals.skipped > 0 ? `, ${preview.totals.skipped} tomme/sumlinjer sprunget over` : ""}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {FIELDS.map((field) => (
                <div key={field} className="flex flex-col gap-1">
                  <Label htmlFor={`map-${field}`}>{MAPPING_LABELS[field]}</Label>
                  <Select
                    id={`map-${field}`}
                    value={options.mapping[field] === null ? "" : String(options.mapping[field])}
                    onChange={(e) => setMapping(field, e.target.value)}
                  >
                    <option value="">– ingen –</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <Label htmlFor="opt-date">Datoformat</Label>
                <Select
                  id="opt-date"
                  value={options.dateFormat}
                  onChange={(e) => update({ ...options, dateFormat: e.target.value })}
                >
                  {["dd-mm-yyyy", "dd.mm.yyyy", "dd/mm/yyyy", "yyyy-mm-dd", "dd-mm-yy"].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="opt-decimal">Decimaltegn</Label>
                <Select
                  id="opt-decimal"
                  value={options.decimal}
                  onChange={(e) => update({ ...options, decimal: e.target.value === "." ? "." : "," })}
                >
                  <option value=",">Komma (1.234,56)</option>
                  <option value=".">Punktum (1234.56)</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="opt-delim">Skilletegn</Label>
                <Select
                  id="opt-delim"
                  value={options.delimiter}
                  onChange={(e) =>
                    update({ ...options, delimiter: e.target.value === "," ? "," : e.target.value === "\t" ? "\t" : ";" })
                  }
                >
                  <option value=";">Semikolon (;)</option>
                  <option value=",">Komma (,)</option>
                  <option value={"\t"}>Tabulator</option>
                </Select>
              </div>
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Linje</TH>
                  <TH>Dato</TH>
                  <TH>Tekst</TH>
                  <TH className="text-right">Beløb</TH>
                  <TH className="text-right">Saldo</TH>
                </TR>
              </THead>
              <TBody>
                {preview.preview.map((r) => (
                  <TR key={r.line}>
                    <TD className="tabular text-muted-foreground">{r.line}</TD>
                    <TD className="tabular">{r.bookingDate}</TD>
                    <TD>{r.text}</TD>
                    <TD className={`tabular text-right ${r.amountOre < 0 ? "text-danger" : "text-success"}`}>
                      {formatDKK(r.amountOre)}
                    </TD>
                    <TD className="tabular text-right">{r.balanceOre === null ? "" : formatDKK(r.balanceOre)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {preview.failed.length > 0 ? (
              <div className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                <p className="font-medium">Rækker der ikke kan importeres:</p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.failed.slice(0, 10).map((f) => (
                    <li key={f.line}>
                      Linje {f.line}: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="bank-account">Bankkonto</Label>
                <Select id="bank-account" value={account} onChange={(e) => setAccount(e.target.value)} className="w-56">
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="__new">+ Ny bankkonto</option>
                </Select>
              </div>
              {account === "__new" ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bank-account-name">Navn på ny konto</Label>
                  <Input id="bank-account-name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-56" />
                </div>
              ) : null}
              <Button onClick={doImport} disabled={pending || preview.totals.rows === 0}>
                <Upload aria-hidden /> Importér {preview.totals.rows} rækker
              </Button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div role="status" className="rounded-md bg-success-soft p-3 text-sm" data-testid="import-result">
            <p>
              <strong>{result.imported}</strong> importeret · <strong>{result.duplicates}</strong> sprunget over som
              dubletter · <strong>{result.failed.length}</strong> fejlede
            </p>
            {result.failed.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-danger">
                {result.failed.map((f) => (
                  <li key={f.line}>
                    Linje {f.line}: {f.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
