import type { RecipeLite } from "@/types";

/** What a user asked for in plain words, split into things they want and things they do not. */
export interface ParsedWish {
  /** The cleaned original text, for the AI prompt. */
  text: string;
  want: string[];
  avoid: string[];
}

const STOP = new Set([
  "something", "anything", "with", "that", "this", "like", "more", "less", "instead", "please", "want", "wanna",
  "make", "give", "dish", "recipe", "meal", "food", "dinner", "lunch", "breakfast", "for", "the", "and", "but",
  "some", "any", "just", "maybe", "can", "could", "would", "also", "very", "really", "from", "have", "has",
  "tonight", "today", "tomorrow", "one", "new", "different", "other", "another", "else", "nothing", "swap",
  "change", "try", "need", "got", "get", "something", "kind", "sort", "type", "bit", "little", "lot", "can't",
  "cant", "don't", "dont", "i'd", "i'm", "ill", "you", "your", "its", "it's", "are", "was", "were", "been",
]);

/** Words that flip what follows into "avoid". */
const NEGATORS = new Set(["no", "not", "without", "avoid", "hate", "except", "skip", "never", "dislike", "allergic"]);
/** Words that end an "avoid" list ("no cheese but with chicken"). */
const BREAKS = new Set(["but", "with", "instead", "plus", "want", "give", "make", "need"]);

const MAX_TOKENS = 5;
const MAX_LENGTH = 200;

/** "tomatoes" -> "tomato", "berries" -> "berry", "noodles" -> "noodle", "grass" stays. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(oes|ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Reads a free-text request such as "something lighter with chicken, no onions". */
export function parseWish(input: string): ParsedWish {
  const text = input.replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
  const words = text.toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(" ").filter(Boolean);

  const want: string[] = [];
  const avoid: string[] = [];
  let avoiding = false;
  for (const raw of words) {
    if (NEGATORS.has(raw)) {
      avoiding = true;
      continue;
    }
    if (BREAKS.has(raw)) avoiding = false;
    if (STOP.has(raw) || raw.length < 3) continue;
    const token = singular(raw);
    const list = avoiding ? avoid : want;
    if (!list.includes(token)) list.push(token);
  }
  return { text, want: want.slice(0, MAX_TOKENS), avoid: avoid.slice(0, MAX_TOKENS) };
}

/** "cheese" and "cheesy" both become "chees", so a request for one finds the other. */
function stem(word: string): string {
  return word.length >= 5 ? word.replace(/(ies|es|s|y|e)$/, "") : word;
}

const has = (haystack: string, token: string) => haystack.includes(stem(token));

/** How many of the wanted words a recipe matches: a name match counts double a tag match. */
export function wishScore(recipe: Pick<RecipeLite, "name" | "tags">, wish: ParsedWish): number {
  const name = recipe.name.toLowerCase();
  const tags = recipe.tags.map((t) => t.toLowerCase());
  let score = 0;
  for (const w of wish.want) {
    if (has(name, w)) score += 2;
    else if (tags.some((t) => has(t, w))) score += 1;
  }
  return score;
}

/** True if the recipe's name or tags mention something the user asked to avoid. */
export function mentionsAvoided(recipe: Pick<RecipeLite, "name" | "tags">, wish: ParsedWish): boolean {
  if (wish.avoid.length === 0) return false;
  const text = [recipe.name, ...recipe.tags].join(" ").toLowerCase();
  return wish.avoid.some((a) => has(text, a));
}

/** True if any ingredient name mentions something the user asked to avoid. */
export function ingredientsMentionAvoided(ingredientNames: string[], wish: ParsedWish): boolean {
  if (wish.avoid.length === 0) return false;
  const text = ingredientNames.join(" ").toLowerCase();
  return wish.avoid.some((a) => has(text, a));
}

/**
 * Orders candidates so the ones matching the request come first. `candidates` should already be
 * in preference order (calorie fit and taste), which is kept within each score. Recipes that
 * mention something avoided are removed. Returns only matches when there are any, else `[]`.
 */
export function applyWish<T extends Pick<RecipeLite, "name" | "tags">>(candidates: T[], wish: ParsedWish): T[] {
  const kept = candidates.filter((r) => !mentionsAvoided(r, wish));
  if (wish.want.length === 0) return kept;
  const scored = kept.map((r, i) => ({ r, i, s: wishScore(r, wish) })).filter((x) => x.s > 0);
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
}

/** What to search for in SQL: name fragments (stems) and exact tags for the wanted words. */
export function searchTerms(wish: ParsedWish): { stems: string[]; tags: string[] } {
  return { stems: wish.want.map(stem), tags: [...wish.want] };
}
