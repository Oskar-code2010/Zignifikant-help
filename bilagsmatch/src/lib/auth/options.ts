import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticate, LoginRateLimitedError } from "./credentials";

function clientIp(headers: Record<string, string | string[] | undefined> | undefined): string {
  const fwd = headers?.["x-forwarded-for"];
  const value = Array.isArray(fwd) ? fwd[0] : fwd;
  return value?.split(",")[0]?.trim() || "local";
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email og adgangskode",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Adgangskode", type: "password" },
      },
      async authorize(credentials, req) {
        try {
          const user = await authenticate(credentials, clientIp(req?.headers));
          return user;
        } catch (e) {
          if (e instanceof LoginRateLimitedError) throw new Error("RATE_LIMITED");
          throw e;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { id: string; organizationId: string; role: string };
        token.uid = u.id;
        token.orgId = u.organizationId;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? "");
      }
      return session;
    },
  },
};
