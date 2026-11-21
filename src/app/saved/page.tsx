"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { RecipeCard, RecipePage } from "@/lib/api-types";
import { MEAL_TYPES, cap, niceName, type MealTypeName } from "@/lib/vocab";
import BowlArt from "@/components/BowlArt";
import { BottomNav, Button, Chip, ErrorText, Segmented, Spinner } from "@/components/ui";

// Tags that say little about the dish; skip them in the subtitle.
const GENERIC = new Set(["main-dish", "dinner", "course", "time-to-make", "preparation", "occasion", "cuisine", "north-american", "dietary", "equipment", "easy", "healthy", "main-ingredient", "meat", "weeknight", "60-minutes-or-less", "30-minutes-or-less", "15-minutes-or-less", "4-hours-or-less"]);

type Scope = "all" | "saved";
type Sort = "for-you" | "name" | "calories";
const SORTS: { value: Sort; label: string }[] = [
  { value: "for-you", label: "For you" },
  { value: "name", label: "A to Z" },
  { value: "calories", label: "Lightest" },
];
const PAGE = 20;

/** Every recipe that is safe for the user: search, filter by meal, sort, open one to put it on a day or log it as eaten. */
export default function RecipesPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [text, setText] = useState("");
  const [q, setQ] = useState(""); // the search text, after a short pause in typing
  const [meal, setMeal] = useState<MealTypeName | null>(null);
  const [sort, setSort] = useState<Sort>("for-you");
  const [items, setItems] = useState<RecipeCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0); // ignore answers from an older search

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const query = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ sort, limit: String(PAGE), offset: String(offset) });
      if (q) p.set("q", q);
      if (meal) p.set("mealType", meal);
      if (scope === "saved") p.set("saved", "true");
      return `/api/recipes?${p.toString()}`;
    },
    [q, meal, sort, scope],
  );

  const load = useCallback(async () => {
    const id = ++run.current;
    setError(null);
    try {
      const page = await api<RecipePage>(query(0));
      if (id !== run.current) return;
      setItems(page.recipes);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (e) {
      if (id === run.current) setError((e as Error).message);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function more() {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    const id = run.current;
    try {
      const page = await api<RecipePage>(query(items.length));
      if (id !== run.current) return;
      setItems((cur) => [...(cur ?? []), ...page.recipes.filter((r) => !(cur ?? []).some((x) => x.id === r.id))]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleHeart(r: RecipeCard) {
    const next = !r.isFavorite;
    // Update the row right away; in the Saved list an un-hearted recipe leaves it. Undo if the call fails.
    setItems((list) => (list ? (scope === "saved" && !next ? list.filter((x) => x.id !== r.id) : list.map((x) => (x.id === r.id ? { ...x, isFavorite: next } : x))) : list));
    try {
      await api("/api/favorites", { method: next ? "POST" : "DELETE", json: { recipeId: r.id } });
    } catch {
      load();
    }
  }

  const plainSaved = scope === "saved" && !q && !meal;

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-14">
        <div>
          <h1 className="mb-1.5 text-[34px] font-semibold leading-none tracking-tight">Recipes</h1>
          <p className="text-[14px] text-ink-muted">Everything that fits your diet and allergies. Open one to put it on a day or log it as eaten.</p>
        </div>

        <Segmented<Scope> options={[{ value: "all", label: "All recipes" }, { value: "saved", label: "Saved" }]} value={scope} onChange={setScope} />
        <input
          type="search"
          aria-label="Search recipes"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search: chicken, soup, pasta…"
          autoComplete="off"
          className="h-[52px] w-full rounded-[14px] border border-line px-4 text-[17px] outline-none focus:border-ink"
        />
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          <Chip label="Any meal" selected={meal === null} onClick={() => setMeal(null)} />
          {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={meal === m} onClick={() => setMeal(meal === m ? null : m)} />)}
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          {SORTS.map((s) => <Chip key={s.value} label={s.label} selected={sort === s.value} onClick={() => setSort(s.value)} />)}
        </div>

        {!items && !error && <div className="flex justify-center py-16"><Spinner /></div>}
        {error && (
          <div>
            <ErrorText>{error}</ErrorText>
            <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
          </div>
        )}
        {items && items.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-10">
            <p className="text-[17px] font-semibold">{plainSaved ? "Nothing saved yet" : "No recipes match"}</p>
            <p className="text-center text-[14px] text-ink-muted">{plainSaved ? "Tap the heart on any recipe to keep it here." : "Try a different word or filter. Recipes with your allergens are never listed."}</p>
            {plainSaved && <Button variant="outline" className="mt-3" onClick={() => setScope("all")}>Browse all recipes</Button>}
          </div>
        )}
        {items && items.length > 0 && <p className="text-[13px] text-ink-muted">{total.toLocaleString()} recipe{total === 1 ? "" : "s"}{q ? ` for "${q}"` : ""}</p>}

        {items?.map((r) => {
          const sub = r.tags.filter((t) => !GENERIC.has(t)).slice(0, 2).map(niceName).join(" · ");
          return (
            <div key={r.id} className="flex items-center gap-3.5">
              <Link href={`/saved/${r.id}`} aria-label={`Open ${r.name}`} className="flex min-h-[72px] flex-1 items-center gap-3.5">
                <span className="flex h-[72px] w-[72px] flex-none items-center justify-center overflow-hidden rounded-[20px] bg-surface"><BowlArt size={52} name={r.name} tags={r.tags} imageUrl={r.imageUrl} /></span>
                <span className="flex-1">
                  <span className="block text-[16px] font-medium">{r.name}</span>
                  <span className="block text-[13px] text-ink-muted">{Math.round(r.calories)} kcal{sub ? ` · ${sub}` : ""}{r.source === "ai" ? " · AI-made" : ""}</span>
                </span>
              </Link>
              <button type="button" aria-label={r.isFavorite ? `Remove ${r.name} from saved` : `Save ${r.name}`} onClick={() => toggleHeart(r)} className="flex h-11 w-11 items-center justify-center">
                <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill={r.isFavorite ? "#D92D20" : "none"} stroke={r.isFavorite ? "#D92D20" : "#6B6B6B"} strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
              </button>
            </div>
          );
        })}
        {hasMore && <Button variant="outline" loading={loadingMore} onClick={more}>Show more</Button>}
      </main>
      <BottomNav />
    </>
  );
}
