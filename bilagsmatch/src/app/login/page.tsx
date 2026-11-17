import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage() {
  const ctx = await getSessionContext();
  if (ctx) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bilagsmatch</h1>
          <p className="mt-1 text-sm text-muted-foreground">Afstemning af bilag og bank</p>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo: demo@bilagsmatch.dk / demo1234
        </p>
      </div>
    </main>
  );
}
