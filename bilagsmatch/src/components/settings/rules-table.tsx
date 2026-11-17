"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch, errorMessage } from "@/lib/client/api";

export interface RuleRow {
  id: string;
  matchType: "SUPPLIER_CVR" | "SUPPLIER_NAME" | "BANK_TEXT_CONTAINS";
  pattern: string;
  accountNumber: string;
  vatCode: string;
  timesApplied: number;
  createdFrom: string;
}

const TYPE_LABEL: Record<RuleRow["matchType"], string> = {
  SUPPLIER_CVR: "Leverandør-CVR",
  SUPPLIER_NAME: "Leverandørnavn",
  BANK_TEXT_CONTAINS: "Banktekst indeholder",
};

export function RulesTable({
  rules,
  accounts,
  vatCodes,
}: {
  rules: RuleRow[];
  accounts: { number: string; name: string }[];
  vatCodes: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { accountNumber: string; vatCode: string }>>(
    {},
  );
  const [pending, setPending] = useState(false);

  async function save(r: RuleRow) {
    const e = edits[r.id];
    if (!e) return;
    try {
      await apiFetch(`/api/rules/${r.id}`, { method: "PATCH", json: e });
      toast.success("Reglen er opdateret.");
      setEdits(({ [r.id]: _drop, ...rest }) => rest);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(r: RuleRow) {
    if (!window.confirm(`Slet reglen for "${r.pattern}"?`)) return;
    try {
      await apiFetch(`/api/rules/${r.id}`, { method: "DELETE" });
      toast.success("Reglen er slettet.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setPending(true);
    try {
      await apiFetch("/api/rules", {
        method: "POST",
        json: {
          matchType: f.get("matchType"),
          pattern: f.get("pattern"),
          accountNumber: f.get("accountNumber"),
          vatCode: f.get("vatCode"),
        },
      });
      toast.success("Reglen er oprettet.");
      form.reset();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const accountOptions = accounts.map((a) => (
    <option key={a.number} value={a.number}>
      {a.number} {a.name}
    </option>
  ));
  const vatOptions = vatCodes.map((v) => (
    <option key={v.code} value={v.code}>
      {v.code}
    </option>
  ));

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Ny regel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-type">Type</Label>
              <Select id="rule-type" name="matchType" defaultValue="SUPPLIER_NAME">
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-pattern">Mønster</Label>
              <Input id="rule-pattern" name="pattern" required placeholder="fx Shopify" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-account">Konto</Label>
              <Select id="rule-account" name="accountNumber" required>
                {accountOptions}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="rule-vat">Momskode</Label>
              <Select id="rule-vat" name="vatCode" required>
                {vatOptions}
              </Select>
            </div>
            <Button type="submit" disabled={pending}>
              <Plus aria-hidden /> Opret regel
            </Button>
          </form>
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <EmptyState title="Ingen regler endnu">
          Regler oprettes automatisk, når du bekræfter et match med konto og momskode – så bliver
          næste bilag fra samme leverandør udfyldt for dig.
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Mønster</TH>
                <TH>Konto</TH>
                <TH>Moms</TH>
                <TH className="text-right">Brugt</TH>
                <TH>Oprettet af</TH>
                <TH>
                  <span className="sr-only">Handlinger</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => {
                const e = edits[r.id] ?? { accountNumber: r.accountNumber, vatCode: r.vatCode };
                const dirty = Boolean(edits[r.id]);
                return (
                  <TR key={r.id}>
                    <TD>{TYPE_LABEL[r.matchType]}</TD>
                    <TD className="font-medium">{r.pattern}</TD>
                    <TD>
                      <Select
                        aria-label={`Konto for ${r.pattern}`}
                        value={e.accountNumber}
                        onChange={(ev) =>
                          setEdits((s) => ({
                            ...s,
                            [r.id]: { ...e, accountNumber: ev.target.value },
                          }))
                        }
                        className="w-56"
                      >
                        {accountOptions}
                      </Select>
                    </TD>
                    <TD>
                      <Select
                        aria-label={`Momskode for ${r.pattern}`}
                        value={e.vatCode}
                        onChange={(ev) =>
                          setEdits((s) => ({ ...s, [r.id]: { ...e, vatCode: ev.target.value } }))
                        }
                        className="w-28"
                      >
                        {vatOptions}
                      </Select>
                    </TD>
                    <TD className="tabular text-right">{r.timesApplied}</TD>
                    <TD className="text-muted-foreground">
                      {r.createdFrom === "MANUAL" ? "Manuelt" : "Lært"}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!dirty}
                        onClick={() => void save(r)}
                      >
                        <Save aria-hidden /> Gem
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => void remove(r)}
                        aria-label={`Slet regel ${r.pattern}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
