import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "./password";
import { loginLimiterByEmail, loginLimiterByIp } from "@/lib/rate-limit";

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: "OWNER" | "MEMBER";
}

export class LoginRateLimitedError extends Error {
  constructor() {
    super("For mange loginforsøg. Vent 15 minutter og prøv igen.");
    this.name = "LoginRateLimitedError";
  }
}

/** Verify email + password. Returns the user or null. Throws when rate limited. */
export async function authenticate(raw: unknown, ip: string): Promise<AuthUser | null> {
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const ipOk = loginLimiterByIp.hit(ip);
  const emailOk = loginLimiterByEmail.hit(email);
  if (!ipOk || !emailOk) throw new LoginRateLimitedError();

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run bcrypt to keep timing similar for unknown emails.
  const hash = user?.passwordHash ?? "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.zA9Yf1qG6G1lZr8sZtYyH1l0hE7K";
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) return null;

  loginLimiterByEmail.reset(email);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    organizationId: user.organizationId,
    role: user.role,
  };
}
