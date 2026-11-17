"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UserMenu({ name, email }: { name: string; email: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right text-sm leading-tight sm:block">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{email}</div>
      </div>
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
        <LogOut aria-hidden />
        Log ud
      </Button>
    </div>
  );
}
