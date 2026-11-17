"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: [string, string][] = [
  ["Enter", "Bekræft forslaget med valgt konto og moms"],
  ["R", "Afvis forslaget"],
  ["J / ↓", "Næste postering"],
  ["K / ↑", "Forrige postering"],
  ["E", "Rediger konto og momskode"],
  ["M", "Find bilag manuelt"],
  ["I", "Ignorer posteringen (fx intern overførsel)"],
  ["B", "Markér som 'Mangler bilag'"],
  ["Esc", "Forlad et felt / luk dialog"],
  ["?", "Vis denne oversigt"],
];

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tastaturgenveje</DialogTitle>
          <DialogDescription>Afstem hurtigt uden mus.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
