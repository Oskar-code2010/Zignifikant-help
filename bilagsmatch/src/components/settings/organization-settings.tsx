"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function OrganizationNameForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/organization", { method: "PATCH", json: { name: value } });
      toast.success("Organisationen er omdøbt.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
  return (
    <form onSubmit={save} className="flex items-end gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="org-name">Navn</Label>
        <Input
          id="org-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
        />
      </div>
      <Button type="submit" disabled={!canEdit || value.trim() === name}>
        <Save aria-hidden /> Gem
      </Button>
    </form>
  );
}

export function CreateUserForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setPending(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        json: {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          role: f.get("role"),
        },
      });
      toast.success("Brugeren er oprettet. Giv personen e-mail og adgangskode.");
      form.reset();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={create} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="user-name">Navn</Label>
        <Input id="user-name" name="name" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="user-email">E-mail</Label>
        <Input id="user-email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="user-password">Midlertidig adgangskode</Label>
        <Input
          id="user-password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="user-role">Rolle</Label>
        <Select id="user-role" name="role" defaultValue="MEMBER">
          <option value="MEMBER">Medlem</option>
          <option value="OWNER">Ejer</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        <UserPlus aria-hidden /> Opret bruger
      </Button>
    </form>
  );
}
