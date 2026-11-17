"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function DeleteClientDialog({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setPending(true);
    try {
      await apiFetch(`/api/clients/${clientId}`, {
        method: "DELETE",
        json: { confirmName: typed },
      });
      toast.success("Klienten og alle tilhørende data er slettet.");
      router.push("/klienter");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={() => setTyped("")}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-danger">
          <Trash2 aria-hidden /> Slet klient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Slet klient</DialogTitle>
          <DialogDescription>
            Dette sletter permanent alle bilag, filer, bankposteringer, afstemninger og kladdeposter
            for <strong>{clientName}</strong>. Handlingen kan ikke fortrydes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-name">Skriv klientens navn for at bekræfte</Label>
          <Input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={typed.trim() !== clientName || pending}
            onClick={onDelete}
          >
            {pending ? "Sletter…" : "Slet permanent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
