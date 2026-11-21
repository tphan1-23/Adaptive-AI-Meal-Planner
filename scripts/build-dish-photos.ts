// Resolves each dish in DISH_RULES to a free Wikipedia/Wikimedia photo and writes
// src/server/recipes/dish-photos.json. Run when the rules change:  npm run build:dish-photos
// It only sends dish names (for example "Lasagne") to Wikipedia, never any user data.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DISH_RULES } from "../src/server/recipes/dish-photos";

const OUT = join(__dirname, "..", "src", "server", "recipes", "dish-photos.json");
const UA = "MealPlannerStudentProject/1.0 (course project; dish photo lookup)";
const WIDTH = 500; // Wikimedia only serves a fixed set of thumbnail widths (for example 500 and 960, not 640)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET with a pause and retries when Wikimedia says "too many requests". */
async function politeFetch(url: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) } });
    if (res.status !== 429) return res;
    await sleep(4000 * (attempt + 1));
  }
  return null;
}

async function resolve(title: string) {
  const res = await politeFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!res || !res.ok) return null;
  const j = (await res.json()) as { thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } };
  const src = j.thumbnail?.source;
  if (!src) return null;
  // ".../330px-File.jpg?utm=..." -> "https://upload.wikimedia.org/.../500px-File.jpg"
  const url = src.split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/").replace(/\/\d+px-/, `/${WIDTH}px-`);
  return { url, page: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}` };
}

async function main() {
  const titles = [...new Set(DISH_RULES.map(([, t]) => t))];
  const out: Record<string, { url: string; page: string }> = {};
  const missing: string[] = [];
  for (const t of titles) {
    const hit = await resolve(t).catch(() => null);
    if (!hit) {
      missing.push(t);
      continue;
    }
    // Make sure the image address really serves an image before keeping it.
    const head = await politeFetch(hit.url, { method: "HEAD" });
    if (head?.ok && (head.headers.get("content-type") ?? "").startsWith("image/")) out[t] = hit;
    else missing.push(`${t} (image not reachable: ${head?.status ?? "no answer"})`);
    await sleep(900); // be polite
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`${Object.keys(out).length} of ${titles.length} dishes have a photo.`);
  if (missing.length) console.log("No photo for:", missing.join(", "));
}

main();
