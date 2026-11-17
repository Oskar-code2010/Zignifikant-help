import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicExtractionProvider, toExtractionError } from "@/lib/extraction/anthropic-provider";
import { MockExtractionProvider } from "@/lib/extraction/mock-provider";
import { ExtractionError, ExtractionResultSchema, type ExtractionResult } from "@/lib/extraction/types";
import { sanityCheck } from "@/lib/extraction/sanity";
import { detectMimeType, isEncryptedPdf, cleanFilename } from "@/lib/files/validate";
import { SAMPLE_DOCUMENTS, totals } from "@/lib/seed/sample-documents";

const GOOD: ExtractionResult = {
  supplierName: "GLS Denmark A/S",
  supplierCvr: "16291824",
  invoiceNumber: "90881234",
  invoiceDate: "2026-09-12",
  dueDate: "2026-09-26",
  totalAmountOre: 187500,
  vatAmountOre: 37500,
  netAmountOre: 150000,
  currency: "DKK",
  description: "Fragt",
  lineItems: [{ description: "Pakker", amountOre: 150000 }],
  isCreditNote: false,
  confidence: 92,
};

function message(text: string, stop: Anthropic.StopReason = "end_turn"): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "test",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

function fakeClient(...responses: (Anthropic.Message | Error)[]) {
  const create = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) create.mockRejectedValueOnce(r);
    else create.mockResolvedValueOnce(r);
  }
  return { client: { messages: { create } } as unknown as Pick<Anthropic, "messages">, create };
}

const PDF = { bytes: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"), mimeType: "application/pdf", filename: "gls.pdf" };
const opts = { model: "test-model", sleep: async () => {}, baseDelayMs: 1 };

const rateLimit = () => new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
const serverError = () => new Anthropic.InternalServerError(500, undefined, "boom", new Headers());

describe("AnthropicExtractionProvider", () => {
  it("sends PDFs as document blocks with structured output and returns validated data", async () => {
    const { client, create } = fakeClient(message(JSON.stringify(GOOD)));
    const p = new AnthropicExtractionProvider({ client, ...opts });
    await expect(p.extract(PDF)).resolves.toEqual(GOOD);
    const req = create.mock.calls[0]![0];
    expect(req.model).toBe("test-model");
    expect(req.messages[0].content[0].type).toBe("document");
    expect(req.messages[0].content[0].source.media_type).toBe("application/pdf");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.system[0].text).toContain("Moms");
  });

  it("sends images as image blocks", async () => {
    const { client, create } = fakeClient(message(JSON.stringify(GOOD)));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    await new AnthropicExtractionProvider({ client, ...opts }).extract({ bytes: png, mimeType: "image/png", filename: "x.png" });
    expect(create.mock.calls[0]![0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/png" } });
  });

  it("retries once with the validation error, then succeeds", async () => {
    const bad = { ...GOOD, totalAmountOre: 1875.5, invoiceDate: "12-09-2026" };
    const { client, create } = fakeClient(message(JSON.stringify(bad)), message(JSON.stringify(GOOD)));
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(PDF)).resolves.toEqual(GOOD);
    expect(create).toHaveBeenCalledTimes(2);
    const retryText = create.mock.calls[1]![0].messages[0].content.at(-1).text as string;
    expect(retryText).toContain("totalAmountOre");
    expect(retryText).toContain("invoiceDate");
  });

  it("fails with a readable Danish error after two invalid responses", async () => {
    const { client, create } = fakeClient(message("not json"), message(JSON.stringify({ foo: 1 })));
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(PDF)).rejects.toThrow(/ugyldige data to gange/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("backs off and retries on rate limits and server errors", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const { client, create } = fakeClient(rateLimit(), serverError(), message(JSON.stringify(GOOD)));
    const p = new AnthropicExtractionProvider({ client, model: "m", sleep, baseDelayMs: 100 });
    await expect(p.extract(PDF)).resolves.toEqual(GOOD);
    expect(create).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it("gives up after 3 retries", async () => {
    const { client, create } = fakeClient(rateLimit(), rateLimit(), rateLimit(), rateLimit());
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(PDF)).rejects.toThrow(/overbelastet/);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("maps timeouts and bad requests to Danish errors", async () => {
    const timeout = new Anthropic.APIConnectionTimeoutError({ message: "timeout" });
    const { client } = fakeClient(timeout, timeout, timeout, timeout);
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(PDF)).rejects.toThrow(/svarede ikke i tide/);
    const bad = new Anthropic.BadRequestError(400, undefined, "bad pdf", new Headers());
    expect(toExtractionError(bad).message).toMatch(/beskadiget/);
    expect(toExtractionError(new Error("x"))).toBeInstanceOf(ExtractionError);
  });

  it("does not retry non-retryable errors", async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, "nope", new Headers());
    const { client, create } = fakeClient(auth);
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(PDF)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("handles refusals", async () => {
    const { client } = fakeClient(message("", "refusal"));
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(PDF)).rejects.toThrow(/afviste/);
  });

  it("rejects password-protected PDFs without calling the API", async () => {
    const { client, create } = fakeClient();
    const enc = { ...PDF, bytes: Buffer.from("%PDF-1.4\ntrailer\n<< /Encrypt 5 0 R >>\n") };
    await expect(new AnthropicExtractionProvider({ client, ...opts }).extract(enc)).rejects.toThrow(/adgangskode/);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects unsupported mime types", async () => {
    const { client } = fakeClient();
    await expect(
      new AnthropicExtractionProvider({ client, ...opts }).extract({ ...PDF, mimeType: "text/plain" }),
    ).rejects.toThrow(/understøttes ikke/);
  });
});

describe("MockExtractionProvider", () => {
  it("returns correct data for every sample document", async () => {
    const p = new MockExtractionProvider();
    for (const d of SAMPLE_DOCUMENTS) {
      const r = await p.extract({ bytes: Buffer.from("x"), mimeType: "application/pdf", filename: d.filename });
      expect(ExtractionResultSchema.parse(r)).toEqual(r);
      expect(r.totalAmountOre).toBe(totals(d).totalOre);
      expect(r.supplierName).toBe(d.supplierName);
      expect(r.confidence).toBeGreaterThan(90);
      expect(sanityCheck(r)).toEqual([]);
    }
  });

  it("is deterministic and derives plausible data for unknown files", async () => {
    const p = new MockExtractionProvider();
    const input = { bytes: Buffer.from("abc"), mimeType: "application/pdf", filename: "faktura-telia_2026-10-03_349,00.pdf" };
    const a = await p.extract(input);
    const b = await p.extract(input);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ supplierName: "Telia", invoiceDate: "2026-10-03", totalAmountOre: 34900, confidence: 35 });
    const c = await p.extract({ ...input, filename: "scan.pdf" });
    expect(c.supplierName).toBeNull();
    expect(c.totalAmountOre).toBeGreaterThan(0);
    expect(ExtractionResultSchema.safeParse(c).success).toBe(true);
  });
});

describe("sanityCheck", () => {
  it("accepts consistent 25 % VAT", () => {
    expect(sanityCheck(GOOD)).toEqual([]);
  });
  it("flags net + VAT ≠ total", () => {
    expect(sanityCheck({ ...GOOD, netAmountOre: 140000 })[0]).toMatch(/svarer ikke til totalen/);
  });
  it("tolerates ±1 kr rounding", () => {
    expect(sanityCheck({ ...GOOD, netAmountOre: 150099 })).toEqual([]);
  });
  it("flags unusual VAT rates but allows zero VAT", () => {
    expect(sanityCheck({ ...GOOD, vatAmountOre: 10000, netAmountOre: 177500 }).join()).toMatch(/Momsen er 5,3 %/);
    expect(sanityCheck({ ...GOOD, vatAmountOre: 0, netAmountOre: 187500 })).toEqual([]);
  });
  it("flags missing total/date and due date before invoice date", () => {
    const w = sanityCheck({ ...GOOD, totalAmountOre: null, invoiceDate: null });
    expect(w).toContain("Totalbeløbet kunne ikke aflæses.");
    expect(w).toContain("Fakturadatoen kunne ikke aflæses.");
    expect(sanityCheck({ ...GOOD, dueDate: "2026-09-01" }).join()).toMatch(/før fakturadatoen/);
  });
  it("works for credit notes (negative amounts)", () => {
    expect(sanityCheck({ ...GOOD, totalAmountOre: -50000, vatAmountOre: -10000, netAmountOre: -40000 })).toEqual([]);
  });
});

describe("file validation", () => {
  it("detects types by magic bytes", () => {
    expect(detectMimeType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectMimeType(Buffer.from("<html>"))).toBeNull();
    expect(detectMimeType(Buffer.from("PK\x03\x04"))).toBeNull();
  });
  it("detects encrypted PDFs", () => {
    expect(isEncryptedPdf(Buffer.from("trailer << /Encrypt 12 0 R >>"))).toBe(true);
    expect(isEncryptedPdf(Buffer.from("%PDF-1.7 plain"))).toBe(false);
  });
  it("cleans filenames", () => {
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("C:\\x\\faktura<1>.pdf")).toBe("faktura_1_.pdf");
  });
});
