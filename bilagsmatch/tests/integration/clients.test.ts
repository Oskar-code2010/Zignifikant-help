import { beforeAll, describe, expect, it } from "vitest";
import * as clientsRoute from "@/app/api/clients/route";
import * as clientRoute from "@/app/api/clients/[clientId]/route";
import { actAs, call, createOrgWithUser } from "./helpers";
import { prisma } from "@/lib/db/client";
import { forOrg, TenantViolationError } from "@/lib/db/scoped";

let a: Awaited<ReturnType<typeof createOrgWithUser>>;
let b: Awaited<ReturnType<typeof createOrgWithUser>>;
let clientB: string;

beforeAll(async () => {
  a = await createOrgWithUser("A");
  b = await createOrgWithUser("B");
  actAs(b.user.id);
  const res = await call(clientsRoute.POST, {
    method: "POST",
    body: { name: "B Webshop ApS", cvr: "87654321" },
  });
  clientB = (res.json as { client: { id: string } }).client.id;
});

describe("clients API", () => {
  it("requires authentication", async () => {
    actAs(null);
    expect((await call(clientsRoute.GET)).status).toBe(401);
    expect((await call(clientsRoute.POST, { method: "POST", body: {} })).status).toBe(401);
    expect((await call(clientRoute.GET, { params: { clientId: clientB } })).status).toBe(401);
  });

  it("validates CVR", async () => {
    actAs(a.user.id);
    const res = await call(clientsRoute.POST, { method: "POST", body: { name: "X", cvr: "123" } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("8 cifre");
  });

  it("creates and lists clients within the org", async () => {
    actAs(a.user.id);
    const res = await call(clientsRoute.POST, {
      method: "POST",
      body: { name: "A Shop ApS", cvr: "DK 1234 5678" },
    });
    expect(res.status).toBe(201);
    const list = await call(clientsRoute.GET);
    const names = (list.json as { clients: { name: string; cvr: string }[] }).clients.map(
      (c) => c.name,
    );
    expect(names).toEqual(["A Shop ApS"]);
  });

  it("user A cannot read, update or delete org B's client", async () => {
    actAs(a.user.id);
    expect((await call(clientRoute.GET, { params: { clientId: clientB } })).status).toBe(404);
    expect(
      (
        await call(clientRoute.PATCH, {
          method: "PATCH",
          params: { clientId: clientB },
          body: { name: "hacked" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(clientRoute.DELETE, {
          method: "DELETE",
          params: { clientId: clientB },
          body: { confirmName: "B Webshop ApS" },
        })
      ).status,
    ).toBe(404);
    const still = await prisma.client.findUnique({ where: { id: clientB } });
    expect(still?.name).toBe("B Webshop ApS");
  });

  it("requires typed confirmation to delete", async () => {
    actAs(b.user.id);
    const wrong = await call(clientRoute.DELETE, {
      method: "DELETE",
      params: { clientId: clientB },
      body: { confirmName: "nope" },
    });
    expect(wrong.status).toBe(400);
  });
});

describe("forOrg scoped client", () => {
  it("injects organizationId into reads", async () => {
    const dbA = forOrg(a.org.id);
    expect(await dbA.client.findUnique({ where: { id: clientB } })).toBeNull();
    expect(await dbA.client.findFirst({ where: { id: clientB } })).toBeNull();
    expect(await dbA.client.count({ where: { id: clientB } })).toBe(0);
  });

  it("refuses to create rows in another org", async () => {
    const dbA = forOrg(a.org.id);
    await expect(
      dbA.client.create({ data: { organizationId: b.org.id, name: "x", cvr: "12345678" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("refuses explicit cross-org filters", async () => {
    const dbA = forOrg(a.org.id);
    await expect(
      dbA.client.findMany({ where: { organizationId: b.org.id } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("scopes updateMany/deleteMany", async () => {
    const dbA = forOrg(a.org.id);
    expect(
      (await dbA.client.updateMany({ where: { id: clientB }, data: { notes: "x" } })).count,
    ).toBe(0);
    expect((await dbA.client.deleteMany({ where: { id: clientB } })).count).toBe(0);
  });

  it("refuses to move a row to another org", async () => {
    const dbB = forOrg(b.org.id);
    await expect(
      dbB.client.update({ where: { id: clientB }, data: { organizationId: a.org.id } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });
});
