import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import { anthropicModel } from "@/lib/env";
import { isEncryptedPdf } from "@/lib/files/validate";
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import {
  ExtractionError,
  ExtractionResultSchema,
  type ExtractionInput,
  type ExtractionProvider,
  type ExtractionResult,
} from "./types";

type MessagesClient = Pick<Anthropic, "messages">;

export interface AnthropicProviderOptions {
  client?: MessagesClient;
  apiKey?: string;
  model?: string;
  /** Max retries for rate limits / server errors / timeouts (exponential backoff). */
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function documentBlock(input: ExtractionInput): Anthropic.ContentBlockParam {
  const data = input.bytes.toString("base64");
  if (input.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  if (input.mimeType === "image/png" || input.mimeType === "image/jpeg") {
    return { type: "image", source: { type: "base64", media_type: input.mimeType, data } };
  }
  throw new ExtractionError("Filtypen understøttes ikke. Brug PDF, JPG eller PNG.");
}

function formatZodIssues(err: ZodError): string {
  return err.issues
    .slice(0, 10)
    .map((i) => `${i.path.join(".") || "(rod)"}: ${i.message}`)
    .join("\n");
}

/**
 * Extraction with Claude. Structured JSON output + Zod validation.
 * - Validation failure → one retry with the validation errors in the prompt, then a readable failure.
 * - 429 / 5xx / timeouts / connection errors → exponential backoff, max `maxRetries` retries.
 */
export class AnthropicExtractionProvider implements ExtractionProvider {
  readonly name = "anthropic";
  private readonly client: MessagesClient;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.client =
      opts.client ??
      new Anthropic({
        apiKey: opts.apiKey,
        maxRetries: 0, // we do our own backoff so it is visible and testable
        timeout: 120_000,
      });
    this.model = opts.model ?? anthropicModel();
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    if (input.mimeType === "application/pdf" && isEncryptedPdf(input.bytes)) {
      throw new ExtractionError(
        "PDF'en er beskyttet med adgangskode eller kryptering. Gem den uden beskyttelse og upload igen.",
      );
    }
    const block = documentBlock(input);
    const baseUser: Anthropic.ContentBlockParam[] = [
      block,
      {
        type: "text",
        text: `Aflæs dette bilag (filnavn: ${input.filename.slice(0, 100)}) og returnér felterne som JSON.`,
      },
    ];

    let lastValidationError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const content: Anthropic.ContentBlockParam[] =
        lastValidationError === null
          ? baseUser
          : [
              ...baseUser,
              {
                type: "text",
                text: `Dit forrige svar kunne ikke valideres:\n${lastValidationError}\nRet fejlene og returnér gyldig JSON efter skemaet. Husk: beløb i hele øre, datoer som YYYY-MM-DD, valuta som ISO-kode.`,
              },
            ];
      const message = await this.callWithBackoff(content);

      if (message.stop_reason === "refusal") {
        throw new ExtractionError("AI-modellen afviste at behandle dokumentet. Udfyld felterne manuelt.");
      }
      if (message.stop_reason === "max_tokens") {
        lastValidationError = "Svaret blev afbrudt (for langt). Returnér kun de vigtigste linjer.";
        continue;
      }
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        lastValidationError = "Svaret var ikke gyldig JSON.";
        continue;
      }
      const parsed = ExtractionResultSchema.safeParse(json);
      if (parsed.success) return parsed.data;
      lastValidationError = formatZodIssues(parsed.error);
    }
    throw new ExtractionError(
      "AI-aflæsningen gav ugyldige data to gange i træk. Udfyld felterne manuelt, eller prøv igen.",
    );
  }

  private async callWithBackoff(content: Anthropic.ContentBlockParam[]): Promise<Anthropic.Message> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.messages.create({
          model: this.model,
          max_tokens: 16000,
          system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
          output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA } },
        });
      } catch (err) {
        const retryable =
          err instanceof Anthropic.RateLimitError ||
          err instanceof Anthropic.InternalServerError ||
          err instanceof Anthropic.APIConnectionError || // includes APIConnectionTimeoutError
          (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 408));
        if (retryable && attempt < this.maxRetries) {
          await this.sleep(this.baseDelayMs * 2 ** attempt);
          continue;
        }
        throw toExtractionError(err);
      }
    }
  }
}

export function toExtractionError(err: unknown): ExtractionError {
  if (err instanceof ExtractionError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ExtractionError("AI-tjenesten svarede ikke i tide. Prøv igen om lidt.", true);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ExtractionError("Kunne ikke forbinde til AI-tjenesten. Tjek netværket og prøv igen.", true);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ExtractionError("AI-tjenesten er overbelastet (for mange forespørgsler). Prøv igen om et par minutter.", true);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ExtractionError("AI-nøglen (ANTHROPIC_API_KEY) er ugyldig eller mangler adgang.");
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ExtractionError("AI-modellen i ANTHROPIC_MODEL findes ikke. Ret indstillingen.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ExtractionError(
      "Dokumentet kunne ikke læses af AI-tjenesten. Filen er måske beskadiget, beskyttet eller for stor.",
    );
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIError) {
    return new ExtractionError("AI-tjenesten havde en fejl. Prøv igen senere.", true);
  }
  return new ExtractionError("Ukendt fejl under aflæsning af dokumentet.");
}
