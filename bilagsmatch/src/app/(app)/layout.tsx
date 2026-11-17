import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { hasAnthropicKey } from "@/lib/env";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const org = await ctx.db.organization.findUnique({ where: { id: ctx.organizationId } });
  const mock = !hasAnthropicKey();

  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={org?.name ?? ""} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-border bg-card px-6">
          {mock ? (
            <Badge variant="warning" data-testid="demo-badge" title="Ingen ANTHROPIC_API_KEY sat – dokumenter aflæses med demo-data">
              Demo-tilstand (ingen AI-nøgle)
            </Badge>
          ) : (
            <Badge variant="success">AI aktiv</Badge>
          )}
          <UserMenu name={ctx.name} email={ctx.email} />
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
