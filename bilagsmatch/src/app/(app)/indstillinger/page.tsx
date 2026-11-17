import type { Metadata } from "next";
import { requirePageContext } from "@/lib/auth/session";
import { getOrganizationOverview } from "@/lib/services/settings";
import { anthropicModel, hasAnthropicKey } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CreateUserForm, OrganizationNameForm } from "@/components/settings/organization-settings";

export const metadata: Metadata = { title: "Indstillinger" };

export default async function SettingsPage() {
  const ctx = await requirePageContext();
  const { org, users } = await getOrganizationOverview(ctx);
  const real = hasAnthropicKey();
  const isOwner = ctx.role === "OWNER";
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <h1 className="text-2xl font-semibold">Indstillinger</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizationNameForm name={org.name} canEdit={isOwner} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI-aflæsning</CardTitle>
          <CardDescription>Bruges til at aflæse leverandør, beløb, moms og datoer fra bilag.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm" data-testid="ai-status">
          {real ? (
            <>
              <p>
                <Badge variant="success">Aktiv</Badge> Anthropic Claude · model <code>{anthropicModel()}</code>
              </p>
              <p className="text-muted-foreground">
                Bilag sendes til Anthropics API til aflæsning. Sørg for at det er dækket af jeres databehandleraftaler.
              </p>
            </>
          ) : (
            <>
              <p>
                <Badge variant="warning">Demo-tilstand</Badge> Ingen <code>ANTHROPIC_API_KEY</code> er sat.
              </p>
              <p className="text-muted-foreground">
                Bilag aflæses med deterministiske demo-data. Kendte eksempelbilag får korrekte data; andre filer får et
                kvalificeret gæt ud fra filnavnet med lav sikkerhed. Sæt <code>ANTHROPIC_API_KEY</code> i <code>.env</code>{" "}
                og genstart for at bruge rigtig AI (model: <code>{anthropicModel()}</code>).
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brugere</CardTitle>
          <CardDescription>{isOwner ? "Som ejer kan du oprette nye brugere i organisationen." : "Kun ejere kan oprette brugere."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <THead>
              <TR>
                <TH>Navn</TH>
                <TH>E-mail</TH>
                <TH>Rolle</TH>
                <TH>Oprettet</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}</TD>
                  <TD>{u.email}</TD>
                  <TD>{u.role === "OWNER" ? "Ejer" : "Medlem"}</TD>
                  <TD className="tabular">{formatDate(u.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {isOwner ? <CreateUserForm /> : null}
        </CardContent>
      </Card>
    </div>
  );
}
