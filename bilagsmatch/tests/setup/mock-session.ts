import { vi } from "vitest";

/**
 * Integration tests call route handlers directly. The session cookie is replaced by this mock:
 * set `globalThis.__testUserId` to act as a user, or null for anonymous.
 */
declare global {
  var __testUserId: string | null | undefined;
}

vi.mock("next-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-auth")>();
  return {
    ...original,
    getServerSession: vi.fn(async () =>
      globalThis.__testUserId
        ? { user: { id: globalThis.__testUserId }, expires: "2999-01-01" }
        : null,
    ),
  };
});
