// Preference learning: turn user signals (swap, rating, favorite, skip) into per-tag affinity
// scores that rank.ts reads. Pure functions only; the database part lives in service.ts.
//
// Food.com tags are noisy. Many describe how a recipe is catalogued ("preparation",
// "course", "cuisine", "time-to-make") or are hard filters rather than tastes ("vegan").
// Learning from them would be meaningless, so they are ignored.

export type SignalType = "swap_out" | "swap_in" | "rating" | "favorite" | "skip" | "eaten";

/** Tags that carry no taste information. */
const GENERIC_TAGS = new Set([
  // catalogue / structure
  "preparation", "time-to-make", "course", "main-ingredient", "dietary", "easy", "occasion",
  "cuisine", "equipment", "number-of-servings", "taste-mood", "technique", "presentation",
  "north-american", "european", "healthy", "healthy-2", "beginner-cook", "inexpensive",
  "kid-friendly", "to-go", "served-hot", "served-cold", "small-appliance", "oven", "stove-top",
  "crock-pot-slow-cooker", "for-large-groups", "for-1-or-2", "dinner-party", "potluck",
  "weeknight", "holiday-event", "seasonal", "gifts", "picnic", "christmas", "summer", "fall",
  "winter", "spring", "no-shell-fish",
  // meal type (the plan already picked the meal) and course words
  "main-dish", "side-dishes", "lunch", "breakfast", "brunch", "dinner", "appetizers", "snacks",
  // dietary flags are hard filters in filter.ts, not tastes
  "vegetarian", "vegan", "gluten-free", "dairy-free", "diabetic", "kosher", "halal",
]);

/** Pattern-based generics, e.g. "30-minutes-or-less", "low-sodium", "free-of-something". */
const GENERIC_PATTERNS = [
  /-(minutes|hours|steps|ingredients)-or-less$/,
  /^(low|high|very-low)-/,
  /^(low|high|free)-(in|of)-something$/,
];

export function isGenericTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return !t || GENERIC_TAGS.has(t) || GENERIC_PATTERNS.some((re) => re.test(t));
}

/** Only the tags worth learning from. */
export function meaningfulTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()))].filter((t) => !isGenericTag(t));
}

// ---------- Learning ----------
/** How far one signal moves each tag, before clamping. */
export const LEARNING_RATE = 0.1;
/** Scores stay inside +/- this so a few signals can never swamp calorie fit in rank.ts. */
export const MAX_AFFINITY = 1.5;

/** How strongly a signal says "I like this" (positive) or "I don't" (negative), in [-1, 1]. */
export function signalStrength(type: SignalType, value = 1): number {
  switch (type) {
    case "favorite":
      return 1;
    case "swap_in":
      return 0.4;
    case "eaten":
      return 0.3; // finishing a planned meal is a mild "this worked for me", weaker than choosing or saving one
    case "swap_out":
      return -0.6;
    case "skip":
      return -0.8;
    case "rating": {
      const stars = Math.min(5, Math.max(1, value)); // 1..5
      return (stars - 3) / 2; // 1 -> -1, 3 -> 0, 5 -> +1
    }
  }
}

const clamp = (n: number) => Math.max(-MAX_AFFINITY, Math.min(MAX_AFFINITY, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * New scores after one signal on a recipe. Only the tags that changed are returned.
 * Generic tags are skipped.
 */
export function applySignal(
  current: Record<string, number>,
  recipeTags: string[],
  type: SignalType,
  value = 1,
): Record<string, number> {
  const delta = signalStrength(type, value) * LEARNING_RATE;
  const out: Record<string, number> = {};
  if (delta === 0) return out;
  for (const tag of meaningfulTags(recipeTags)) {
    out[tag] = round3(clamp((current[tag] ?? 0) + delta));
  }
  return out;
}

export interface SignalRecord {
  type: SignalType;
  value?: number;
  recipeTags: string[];
}

/** Rebuild all affinities from a signal history (oldest first). Useful for back-fills and tests. */
export function recomputeAffinity(signals: SignalRecord[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const s of signals) Object.assign(scores, applySignal(scores, s.recipeTags, s.type, s.value));
  return scores;
}

/** The user's strongest likes and dislikes, for prompts and debugging. */
export function topTags(scores: Record<string, number>, n = 5) {
  const entries = Object.entries(scores);
  return {
    liked: entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t),
    disliked: entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, n).map(([t]) => t),
  };
}
