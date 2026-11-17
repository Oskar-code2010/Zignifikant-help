import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  NEXTAUTH_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  STORAGE_DIR: z.string().optional(),
  EXTRACTION_WORKER_ENABLED: z.string().optional(),
});

/** Read and validate environment variables at call time (tests change them). */
export function env() {
  return EnvSchema.parse(process.env);
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** The model used by the Anthropic provider. Only place the default is defined. */
export function anthropicModel(): string {
  const m = env().ANTHROPIC_MODEL?.trim();
  return m && m.length > 0 ? m : DEFAULT_ANTHROPIC_MODEL;
}

export function hasAnthropicKey(): boolean {
  const k = env().ANTHROPIC_API_KEY?.trim();
  return Boolean(k && k.length > 0);
}
