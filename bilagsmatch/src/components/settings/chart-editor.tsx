"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/client/api";

interface AccountRow {
  id: string;
  number: string;
  name: string;
  type: string;
  defaultVatCode: string | null;
}
interface VatRow {
  id: string;
  code: string;
  name: string;
  description: string;
  ratePercent: number;
}

const TYPES: Record<string, string> = {
  REVENUE: "Indtægt",
  EXPENSE: "Udgift",
  ASSET: "Aktiv",
  LIABILITY: "Passiv",
  EQUITY: "Egenkapital",
};

export function ChartEditor({ accounts, vatCodes }: { accounts: AccountRow[]; vatCodes: VatRow[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { name: string; defaultVatCode: string }>>({});
  const [vatEdits, setVatEdits] = useState<Record<string, { name: string; description: string }>>({});

  async function saveAccount(a: AccountRow) {
    const e = edits[a.id];
    if (!e) return;
    try {
      await apiFetch(`/api/accounts/${a.id}`, {
        method: "PATCH",
        json: { name: e.name, defaultVatCode: e.defaultVatCode || null },
      });
      toast.success(`Konto ${a.number} er gemt.`);
      setEdits(({ [a.id]: _d, ...rest }) => rest);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function saveVat(v: VatRow) {
    const e = vatEdits[v.id];
    if (!e) return;
    try {
      await apiFetch(`/api/vat-codes/${v.id}`, { method: "PATCH", json: e });
      toast.success(`Momskode ${v.code} er gemt.`);
      setVatEdits(({ [v.id]: _d, ...rest }) => rest);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function createAccount(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        json: {
          number: f.get("number"),
          name: f.get("name"),
          type: f.get("type"),
          defaultVatCode: f.get("defaultVatCode") || null,
        },
      });
      toast.success("Kontoen er oprettet.");
      form.reset();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const vatOptions = (
    <>
      <option value="">– ingen –</option>
      {vatCodes.map((v) => (
        <option key={v.code} value={v.code}>
          {v.code}
        </option>
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Kontoplan</CardTitle>
          <CardDescription>Forenklet standardkontoplan for webshops. Ret navne og standard-momskoder, eller tilføj konti.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={createAccount} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-number">Nummer</Label>
              <Input id="acc-number" name="number" required inputMode="numeric" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-name">Navn</Label>
              <Input id="acc-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-type">Type</Label>
              <Select id="acc-type" name="type" defaultValue="EXPENSE">
                {Object.entries(TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="acc-vat">Standardmoms</Label>
              <Select id="acc-vat" name="defaultVatCode">
                {vatOptions}
              </Select>
            </div>
            <Button type="submit">
              <Plus aria-hidden /> Tilføj konto
            </Button>
          </form>
          <Table>
            <THead>
              <TR>
                <TH>Nr.</TH>
                <TH>Navn</TH>
                <TH>Type</TH>
                <TH>Standardmoms</TH>
                <TH>
                  <span className="sr-only">Gem</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {accounts.map((a) => {
                const e = edits[a.id] ?? { name: a.name, defaultVatCode: a.defaultVatCode ?? "" };
                return (
                  <TR key={a.id}>
                    <TD className="tabular font-medium">{a.number}</TD>
                    <TD>
                      <Input
                        aria-label={`Navn på konto ${a.number}`}
                        value={e.name}
                        onChange={(ev) => setEdits((s) => ({ ...s, [a.id]: { ...e, name: ev.target.value } }))}
                      />
                    </TD>
                    <TD className="text-muted-foreground">{TYPES[a.type] ?? a.type}</TD>
                    <TD>
                      <Select
                        aria-label={`Standardmoms for konto ${a.number}`}
                        value={e.defaultVatCode}
                        onChange={(ev) => setEdits((s) => ({ ...s, [a.id]: { ...e, defaultVatCode: ev.target.value } }))}
                        className="w-28"
                      >
                        {vatOptions}
                      </Select>
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="outline" disabled={!edits[a.id]} onClick={() => void saveAccount(a)}>
                        <Save aria-hidden /> Gem
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Momskoder</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Kode</TH>
                <TH>Navn</TH>
                <TH>Beskrivelse</TH>
                <TH className="text-right">Sats</TH>
                <TH>
                  <span className="sr-only">Gem</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {vatCodes.map((v) => {
                const e = vatEdits[v.id] ?? { name: v.name, description: v.description };
                return (
                  <TR key={v.id}>
                    <TD className="font-medium">{v.code}</TD>
                    <TD>
                      <Input
                        aria-label={`Navn på momskode ${v.code}`}
                        value={e.name}
                        onChange={(ev) => setVatEdits((s) => ({ ...s, [v.id]: { ...e, name: ev.target.value } }))}
                      />
                    </TD>
                    <TD className="min-w-80">
                      <Input
                        aria-label={`Beskrivelse af momskode ${v.code}`}
                        value={e.description}
                        onChange={(ev) => setVatEdits((s) => ({ ...s, [v.id]: { ...e, description: ev.target.value } }))}
                      />
                    </TD>
                    <TD className="tabular text-right">{v.ratePercent} %</TD>
                    <TD className="text-right">
                      <Button size="sm" variant="outline" disabled={!vatEdits[v.id]} onClick={() => void saveVat(v)}>
                        <Save aria-hidden /> Gem
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
