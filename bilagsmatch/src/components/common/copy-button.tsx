"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ text, label = "Kopiér" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Kopieret til udklipsholderen.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kunne ikke kopiere. Markér teksten og kopiér manuelt.");
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={() => void copy()}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {label}
    </Button>
  );
}
