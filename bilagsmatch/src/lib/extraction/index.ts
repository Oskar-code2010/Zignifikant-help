import { hasAnthropicKey } from "@/lib/env";
import { AnthropicExtractionProvider } from "./anthropic-provider";
import { MockExtractionProvider } from "./mock-provider";
import type { ExtractionProvider } from "./types";

export * from "./types";

/** Real provider when ANTHROPIC_API_KEY is set, otherwise the deterministic mock. */
export function getExtractionProvider(): ExtractionProvider {
  return hasAnthropicKey() ? new AnthropicExtractionProvider() : new MockExtractionProvider();
}
