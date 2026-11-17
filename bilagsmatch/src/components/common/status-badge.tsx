import { Badge } from "@/components/ui/badge";

const TX: Record<
  string,
  { label: string; variant: "muted" | "warning" | "success" | "default" | "danger" }
> = {
  UNMATCHED: { label: "Ikke afstemt", variant: "muted" },
  SUGGESTED: { label: "Forslag", variant: "warning" },
  MATCHED: { label: "Afstemt", variant: "success" },
  IGNORED: { label: "Ignoreret", variant: "default" },
  MISSING_RECEIPT: { label: "Mangler bilag", variant: "danger" },
};

export const TX_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TX).map(([k, v]) => [k, v.label]),
);

export function TransactionStatusBadge({ status }: { status: string }) {
  const s = TX[status] ?? { label: status, variant: "muted" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const DOC: Record<string, { label: string; variant: "muted" | "warning" | "success" | "danger" }> =
  {
    UPLOADED: { label: "I kø", variant: "muted" },
    EXTRACTING: { label: "Aflæser…", variant: "warning" },
    EXTRACTED: { label: "Aflæst", variant: "success" },
    FAILED: { label: "Fejlet", variant: "danger" },
  };

export function DocumentStatusBadge({ status }: { status: string }) {
  const s = DOC[status] ?? { label: status, variant: "muted" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
