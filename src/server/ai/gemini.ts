import { GoogleGenerativeAI } from "@google/generative-ai";

// Aliases track the current Flash models. The lite model is tried when the main one is busy.
const DEFAULT_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 15_000;
/** After an overload (503) or timeout, skip that model for this long. */
const COOLDOWN_MS = 60_000;
/** A quota error (429) usually lasts longer, so rest the model longer. */
const QUOTA_COOLDOWN_MS = 5 * 60_000;

const coolingUntil = new Map<string, number>();

async function generate(client: GoogleGenerativeAI, modelName: string, prompt: string): Promise<string> {
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Gemini timeout")), TIMEOUT_MS)),
  ]);
  return result.response.text();
}

/** How long to skip a model after this error, or 0 if the error is not about capacity. */
function cooldownFor(e: unknown): number {
  const msg = String((e as { message?: string })?.message ?? e);
  if (/\b429\b/.test(msg)) return QUOTA_COOLDOWN_MS;
  if (/\b503\b/.test(msg) || msg.includes("timeout")) return COOLDOWN_MS;
  return 0;
}

/**
 * The only place that calls Gemini. Server-side only: the key never reaches the browser.
 * Returns the raw JSON text. Tries each model once (GEMINI_MODEL overrides the list), skipping
 * models that recently hit quota or overload, and throws if all fail, and the adapter turns
 * that into its code-based fallback.
 */
export async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const client = new GoogleGenerativeAI(key);
  const all = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : DEFAULT_MODELS;
  const now = Date.now();
  const ready = all.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  // If every model is cooling down, try them anyway rather than failing without a call.
  const models = ready.length > 0 ? ready : all;

  let lastError: unknown;
  for (const name of models) {
    try {
      return await generate(client, name, prompt);
    } catch (e) {
      lastError = e;
      const rest = cooldownFor(e);
      if (rest > 0) coolingUntil.set(name, Date.now() + rest);
    }
  }
  throw lastError;
}

/** Test helper. */
export function resetGeminiCooldowns() {
  coolingUntil.clear();
}
