import { prisma } from "@/lib/db/client";
import { provisionOrganizationDefaults } from "@/lib/accounting/provision";

let counter = 0;

export async function createOrgWithUser(label: string) {
  counter += 1;
  const org = await prisma.organization.create({ data: { name: `Org ${label}` } });
  await provisionOrganizationDefaults(prisma, org.id);
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `${label.toLowerCase()}-${counter}-${Date.now()}@test.dk`,
      name: `User ${label}`,
      role: "OWNER",
      passwordHash: "x",
    },
  });
  return { org, user };
}

export function actAs(userId: string | null): void {
  globalThis.__testUserId = userId;
}

type Handler<P> = (req: Request, route: { params: Promise<P> }) => Promise<Response>;

export async function call<P extends object>(
  handler: Handler<P>,
  opts: { method?: string; params?: P; body?: unknown; url?: string; formData?: FormData } = {},
): Promise<{ status: number; json: unknown; res: Response }> {
  const init: RequestInit = { method: opts.method ?? "GET" };
  if (opts.formData) init.body = opts.formData;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await handler(new Request(opts.url ?? "http://localhost/api/test", init), {
    params: Promise.resolve((opts.params ?? {}) as P),
  });
  const type = res.headers.get("content-type") ?? "";
  const json = type.includes("application/json") ? await res.json() : null;
  return { status: res.status, json, res };
}
