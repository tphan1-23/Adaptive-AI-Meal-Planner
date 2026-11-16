import { GoogleGenerativeAI } from "@google/generative-ai";

// Aliases track the current Flash models. The lite model is tried when the main one is busy.
const DEFAULT_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 20_000;

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

/**
 * The only place that calls Gemini. Server-side only: the key never reaches the browser.
 * Returns the raw JSON text. Tries each model once (GEMINI_MODEL overrides the list) and
 * throws if all fail, and the adapter turns that into its code-based fallback.
 */
export async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const client = new GoogleGenerativeAI(key);
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : DEFAULT_MODELS;
  let lastError: unknown;
  for (const name of models) {
    try {
      return await generate(client, name, prompt);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
