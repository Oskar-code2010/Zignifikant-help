"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  Keyboard,
  Play,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentPreview } from "@/components/documents/document-preview";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatDKK } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { HelpDialog } from "./help-dialog";
import { ManualMatchDialog } from "./manual-match-dialog";
import { BulkConfirmDialog } from "./bulk-confirm-dialog";
import type { AccountOption, ReviewItem, VatOption } from "./types";

const HIGH = 85;

const fmtDate = (iso: string | null) => (iso ? formatDate(new Date(iso)) : "–");

function docAmount(ore: number | null, currency: string | null) {
  if (ore === null) return "–";
  return currency && currency !== "DKK"
    ? `${formatDKK(ore).replace(" kr.", "")} ${currency}`
    : formatDKK(ore);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export function ReviewScreen({
  clientId,
  initialItems,
  accounts,
  vatCodes,
}: {
  clientId: string;
  initialItems: ReviewItem[];
  accounts: AccountOption[];
  vatCodes: VatOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, { account: string; vat: string }>>({});
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  const current: ReviewItem | undefined = items[safeIndex];
  const suggestion = current?.match
    ? { account: current.match.suggestedAccount ?? "", vat: current.match.suggestedVatCode ?? "" }
    : {
        account: current?.fallbackSuggestion?.accountNumber ?? "",
        vat: current?.fallbackSuggestion?.vatCode ?? "",
      };
  const choice = current
    ? (choices[current.transaction.id] ?? suggestion)
    : { account: "", vat: "" };

  const suggestedCount = items.filter((i) => i.match).length;
  const highCount = items.filter((i) => i.match && i.match.score >= HIGH).length;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  const setChoice = (patch: Partial<{ account: string; vat: string }>) => {
    if (!current) return;
    const next = { ...choice, ...patch };
    if (patch.account !== undefined && patch.vat === undefined) {
      const acc = accounts.find((a) => a.number === patch.account);
      if (acc?.defaultVatCode && !choice.vat) next.vat = acc.defaultVatCode;
    }
    setChoices((c) => ({ ...c, [current.transaction.id]: next }));
  };

  const refresh = useCallback(async () => {
    const res = await apiFetch<{ items: ReviewItem[] }>(`/api/clients/${clientId}/review`);
    setItems(res.items);
  }, [clientId]);

  const removeCurrent = () => {
    if (!current) return;
    setItems((prev) => prev.filter((i) => i.transaction.id !== current.transaction.id));
  };

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const confirm = () =>
    run(async () => {
      if (!current?.match) {
        toast.info("Der er intet forslag at bekræfte. Tryk M for at matche manuelt.");
        return;
      }
      if (!choice.account || !choice.vat) {
        toast.error("Vælg konto og momskode før du bekræfter (tryk E).");
        document.getElementById("review-account")?.focus();
        return;
      }
      await apiFetch(`/api/matches/${current.match.id}/confirm`, {
        method: "POST",
        json: { accountNumber: choice.account, vatCode: choice.vat },
      });
      toast.success("Match bekræftet og bogført i kladden.");
      removeCurrent();
    });

  const reject = () =>
    run(async () => {
      if (!current?.match) return;
      await apiFetch(`/api/matches/${current.match.id}/reject`, { method: "POST" });
      toast.success("Forslaget er afvist.");
      const id = current.transaction.id;
      setItems((prev) => prev.map((i) => (i.transaction.id === id ? { ...i, match: null } : i)));
      setIndex(safeIndex + 1 < items.length ? safeIndex + 1 : safeIndex);
    });

  const setState = (action: "IGNORE" | "MISSING_RECEIPT") =>
    run(async () => {
      if (!current) return;
      if (current.match) {
        await apiFetch(`/api/matches/${current.match.id}/reject`, { method: "POST" });
      }
      await apiFetch(`/api/transactions/${current.transaction.id}/state`, {
        method: "POST",
        json: { action },
      });
      toast.success(
        action === "IGNORE" ? "Posteringen ignoreres." : "Markeret som 'Mangler bilag'.",
      );
      removeCurrent();
    });

  const runMatching = () =>
    run(async () => {
      const res = await apiFetch<{ suggested: number; highConfidence: number }>(
        `/api/clients/${clientId}/matching/run`,
        {
          method: "POST",
        },
      );
      await refresh();
      setIndex(0);
      toast.success(
        `Afstemning kørt: ${res.suggested} forslag, heraf ${res.highConfidence} med høj sikkerhed.`,
      );
    });

  const move = (delta: number) =>
    setIndex(Math.max(0, Math.min(items.length - 1, safeIndex + delta)));

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (helpOpen || manualOpen || bulkOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape" && e.target instanceof HTMLElement) e.target.blur();
        return;
      }
      const key = e.key;
      if (key === "Enter") {
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        e.preventDefault();
        void confirm();
      } else if (key === "r" || key === "R") {
        e.preventDefault();
        void reject();
      } else if (key === "j" || key === "J" || key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (key === "k" || key === "K" || key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (key === "e" || key === "E") {
        e.preventDefault();
        document.getElementById("review-account")?.focus();
      } else if (key === "m" || key === "M") {
        e.preventDefault();
        if (current) setManualOpen(true);
      } else if (key === "i" || key === "I") {
        e.preventDefault();
        void setState("IGNORE");
      } else if (key === "b" || key === "B") {
        e.preventDefault();
        void setState("MISSING_RECEIPT");
      } else if (key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void runMatching()} disabled={busy} data-testid="run-matching">
        <Play aria-hidden /> Kør afstemning
      </Button>
      <Button
        variant="success"
        onClick={() => setBulkOpen(true)}
        disabled={busy || highCount === 0}
      >
        <ShieldCheck aria-hidden /> Bekræft alle med høj sikkerhed ({highCount})
      </Button>
      <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
        <span data-testid="review-stats">
          {items.length} åbne · {suggestedCount} forslag · {highCount} høj sikkerhed
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHelpOpen(true)}
          aria-label="Vis tastaturgenveje"
        >
          <Keyboard aria-hidden /> <kbd>?</kbd>
        </Button>
      </div>
    </div>
  );

  const dialogs = (
    <>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <BulkConfirmDialog
        clientId={clientId}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={async () => {
          await refresh();
          setIndex(0);
        }}
      />
      {current ? (
        <ManualMatchDialog
          key={current.transaction.id}
          clientId={clientId}
          open={manualOpen}
          onOpenChange={setManualOpen}
          transaction={current.transaction}
          accounts={accounts}
          vatCodes={vatCodes}
          onMatched={() => {
            setManualOpen(false);
            removeCurrent();
          }}
        />
      ) : null}
    </>
  );

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        {toolbar}
        <EmptyState title="Alt er afstemt" icon={<Check className="h-8 w-8" />}>
          Der er ingen åbne bankposteringer. Importér et nyt bankudtog eller upload flere bilag, og
          kør afstemningen igen.
        </EmptyState>
        {dialogs}
      </div>
    );
  }

  const m = current.match;
  const t = current.transaction;

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_22rem] lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Left: queue + transaction */}
        <Card className="flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden">
          <div className="border-b border-border p-4" data-testid="current-transaction">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bankpostering</p>
            <p className="mt-1 font-medium">{t.text}</p>
            <p
              className={cn(
                "tabular mt-1 text-xl font-semibold",
                t.amountOre > 0 && "text-success",
              )}
            >
              {formatDKK(t.amountOre)}
            </p>
            <p className="tabular text-sm text-muted-foreground">{fmtDate(t.bookingDate)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void setState("IGNORE")}
                disabled={busy}
              >
                <Ban aria-hidden /> Ignorer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void setState("MISSING_RECEIPT")}
                disabled={busy}
              >
                <FileQuestion aria-hidden /> Mangler bilag
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
            <span>
              {safeIndex + 1} af {items.length}
            </span>
            <span className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => move(-1)}
                aria-label="Forrige (K)"
              >
                <ChevronUp aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => move(1)}
                aria-label="Næste (J)"
              >
                <ChevronDown aria-hidden />
              </Button>
            </span>
          </div>
          <ol
            ref={listRef}
            className="flex-1 overflow-y-auto px-2 pb-2"
            aria-label="Åbne posteringer"
          >
            {items.map((it, i) => (
              <li key={it.transaction.id} data-index={i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === safeIndex ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    i === safeIndex ? "bg-accent" : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      it.match
                        ? it.match.score >= HIGH
                          ? "bg-success"
                          : "bg-warning"
                        : "bg-input",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{it.transaction.text}</span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {formatDKK(it.transaction.amountOre)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>

        {/* Middle: document preview */}
        <Card className="min-h-[60vh] p-3">
          {m ? (
            <DocumentPreview
              id={m.document.id}
              mimeType={m.document.mimeType}
              title={m.document.originalFilename}
            />
          ) : (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <FileQuestion className="h-10 w-10" aria-hidden />
              <p className="font-medium text-foreground">Intet bilagsforslag til denne postering</p>
              <p className="max-w-sm text-sm">
                Søg efter et bilag manuelt (<kbd>M</kbd>), markér den som <em>Mangler bilag</em> (
                <kbd>B</kbd>), eller ignorer den, hvis det fx er en intern overførsel (<kbd>I</kbd>
                ).
              </p>
              <Button variant="outline" onClick={() => setManualOpen(true)}>
                <Search aria-hidden /> Find bilag manuelt
              </Button>
            </div>
          )}
        </Card>

        {/* Right: data, reasons, account/VAT, actions */}
        <Card
          className="flex flex-col gap-4 p-4 lg:col-span-2 xl:col-span-1"
          data-testid="decision-panel"
        >
          {m ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant={m.score >= HIGH ? "success" : "warning"}
                  data-testid="confidence-badge"
                >
                  {m.score >= HIGH ? "Høj sikkerhed" : "Tjek venligst"} · {m.score}
                </Badge>
                {m.document.isCreditNote ? <Badge variant="default">Kreditnota</Badge> : null}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Leverandør</dt>
                <dd className="font-medium">{m.document.supplierName ?? "–"}</dd>
                <dt className="text-muted-foreground">CVR</dt>
                <dd className="tabular">{m.document.supplierCvr ?? "–"}</dd>
                <dt className="text-muted-foreground">Fakturanr.</dt>
                <dd className="tabular">{m.document.invoiceNumber ?? "–"}</dd>
                <dt className="text-muted-foreground">Fakturadato</dt>
                <dd className="tabular">{fmtDate(m.document.invoiceDate)}</dd>
                <dt className="text-muted-foreground">Forfald</dt>
                <dd className="tabular">{fmtDate(m.document.dueDate)}</dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="tabular font-medium">
                  {docAmount(m.document.totalAmountOre, m.document.currency)}
                </dd>
                <dt className="text-muted-foreground">Moms</dt>
                <dd className="tabular">
                  {docAmount(m.document.vatAmountOre, m.document.currency)}
                </dd>
              </dl>
              {m.document.description ? (
                <p className="text-sm text-muted-foreground">{m.document.description}</p>
              ) : null}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Hvorfor dette match?
                </p>
                <ul className="flex flex-col gap-1 text-sm" data-testid="match-reasons">
                  {m.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      {r}
                    </li>
                  ))}
                  {m.document.warnings.map((w) => (
                    <li key={w} className="flex gap-2 text-warning">
                      <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Vælg et bilag manuelt for at kunne bekræfte denne postering.
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="review-account">
                Konto <kbd>E</kbd>
              </Label>
              <Select
                id="review-account"
                value={choice.account}
                onChange={(e) => setChoice({ account: e.target.value })}
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
              <Label htmlFor="review-vat">Momskode</Label>
              <Select
                id="review-vat"
                value={choice.vat}
                onChange={(e) => setChoice({ vat: e.target.value })}
              >
                <option value="">– vælg momskode –</option>
                {vatCodes.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.code} – {v.name}
                  </option>
                ))}
              </Select>
            </div>
            {(m?.suggestionSource ?? current.fallbackSuggestion?.explanation) ? (
              <p className="text-xs text-muted-foreground" data-testid="suggestion-source">
                {m?.suggestionSource ?? current.fallbackSuggestion?.explanation}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Intet kontoforslag – vælg selv. Valget huskes til næste gang.
              </p>
            )}
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              variant="success"
              onClick={() => void confirm()}
              disabled={busy || !m}
              className="flex-1"
            >
              <Check aria-hidden /> Bekræft <kbd className="bg-transparent text-white">Enter</kbd>
            </Button>
            <Button variant="outline" onClick={() => void reject()} disabled={busy || !m}>
              <X aria-hidden /> Afvis <kbd>R</kbd>
            </Button>
            <Button variant="outline" onClick={() => setManualOpen(true)} disabled={busy}>
              <Search aria-hidden /> Manuelt <kbd>M</kbd>
            </Button>
          </div>
        </Card>
      </div>
      {dialogs}
    </div>
  );
}
