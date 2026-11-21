"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cap } from "@/lib/vocab";
import BowlArt from "@/components/BowlArt";
import Sheet from "@/components/Sheet";
import { Button, ErrorText, Spinner, cx } from "@/components/ui";

type Recipe = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
  tags: string[];
  imageUrl: string | null;
  isFavorite: boolean;
};

const qty = (i: Recipe["ingredients"][number]) => (i.unit === "item" ? "" : `${+i.quantity.toFixed(2)} ${i.unit}`);

/** A saved recipe on its own (not tied to a day in the plan): photo, nutrition, ingredients and method. */
export default function SavedRecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [favorite, setFavorite] = useState(true);
  const [tab, setTab] = useState<"ingr" | "method">("ingr");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { recipe } = await api<{ recipe: Recipe }>(`/api/recipes/${id}`);
      setRecipe(recipe);
      setFavorite(recipe.isFavorite);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "We couldn't find that recipe." : (e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFavorite() {
    if (!recipe) return;
    const next = !favorite;
    setFavorite(next);
    try {
      await api("/api/favorites", { method: next ? "POST" : "DELETE", json: { recipeId: recipe.id } });
    } catch {
      setFavorite(!next);
    }
  }

  const stat = (label: string, v: number | null, unit = "g", accent?: boolean) => (
    <div>
      <div className="text-[12px] text-ink-muted">{label}</div>
      <div className={cx("text-[19px] font-semibold", accent && "text-brand")}>{v === null ? "–" : `${Math.round(v)}${unit}`}</div>
    </div>
  );

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-12">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/saved"))} className="-ml-2.5 flex h-11 w-11 items-center justify-center">
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        {recipe && (
          <button type="button" aria-label={favorite ? "Remove from saved recipes" : "Save recipe"} onClick={toggleFavorite} className="-mr-2.5 flex h-11 w-11 items-center justify-center">
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill={favorite ? "#D92D20" : "none"} stroke={favorite ? "#D92D20" : "currentColor"} strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
          </button>
        )}
      </div>

      {!recipe && !error && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && (
        <div>
          <ErrorText>{error}</ErrorText>
          <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
        </div>
      )}

      {recipe && (
        <>
          <div className="flex h-[200px] items-center justify-center overflow-hidden rounded-[28px] bg-surface"><BowlArt size={170} name={recipe.name} tags={recipe.tags} imageUrl={recipe.imageUrl} /></div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight">{recipe.name}</h1>
          <div className="grid grid-cols-4 gap-2 border-y border-line py-3">
            {stat("kcal", recipe.calories, "", true)}
            {stat("Protein", recipe.proteinG)}
            {stat("Carbs", recipe.carbsG)}
            {stat("Fat", recipe.fatG)}
          </div>
          <Button onClick={() => setPicking(true)}>Use on a day</Button>
          <div role="tablist" className="flex rounded-[14px] p-1" style={{ backgroundColor: "#F3F3F1" }}>
            {(["ingr", "method"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-11 flex-1 rounded-[11px] text-[15px]", tab === t ? "bg-white font-semibold text-ink" : "font-medium text-ink-muted")}>
                {t === "ingr" ? "Ingredients" : "Method"}
              </button>
            ))}
          </div>
          {tab === "ingr" ? (
            <div className="border-b border-line">
              {recipe.ingredients.map((i, n) => (
                <div key={`${i.name}-${n}`} className="flex justify-between border-t border-line py-3.5 text-[16px]"><span>{cap(i.name)}</span><span className="text-ink-muted">{qty(i)}</span></div>
              ))}
            </div>
          ) : (
            <div>
              {recipe.steps.length === 0 && <p className="text-[14px] text-ink-muted">No steps for this recipe.</p>}
              {recipe.steps.map((s, n) => (
                <div key={n} className="flex gap-4 border-t border-line py-[18px]">
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[14px] font-semibold" style={{ backgroundColor: "#F3F3F1" }}>{n + 1}</span>
                  <p className="flex-1 text-[16px] leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {picking && recipe && <DaySheet recipeId={recipe.id} onClose={() => setPicking(false)} />}
    </main>
  );
}

type PlanDay = { entryId: string; date: string; meal: string };

/** Pick a day of this week's plan to cook a saved recipe. The server re-checks it against allergies and diet first. */
function DaySheet({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState<PlanDay[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ plan: { entries: { id: string; date: string; position: number; recipe: { name: string } }[] } }>("/api/plan")
      .then(({ plan }) => {
        const first = new Map<string, PlanDay>();
        for (const e of [...plan.entries].sort((a, b) => a.position - b.position)) {
          const d = e.date.slice(0, 10);
          if (!first.has(d)) first.set(d, { entryId: e.id, date: d, meal: e.recipe.name });
        }
        setDays([...first.values()].sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function use(d: PlanDay) {
    setBusy(d.entryId);
    setError(null);
    try {
      await api("/api/swap", { method: "POST", json: { entryId: d.entryId, recipeId } });
      onClose();
      router.push("/today");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? "This recipe doesn't fit your allergies or diet, so it can't be added." : (e as Error).message);
      setBusy(null);
    }
  }

  return (
    <Sheet title="Use on a day" onClose={onClose}>
      <p className="mb-3 text-[14px] text-ink-muted">It replaces that day&apos;s meal. It&apos;s checked against your allergies and diet first.</p>
      {!days && !error && <div className="flex justify-center py-6"><Spinner /></div>}
      {days?.map((d) => (
        <button key={d.entryId} type="button" disabled={busy !== null} onClick={() => use(d)} className={cx("flex w-full items-center gap-3 border-t border-line py-3 text-left", busy && busy !== d.entryId && "opacity-40")}>
          <span className="w-[84px] text-[15px] font-semibold">{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</span>
          <span className="flex-1 truncate text-[14px] text-ink-muted">{d.meal}</span>
          {busy === d.entryId ? <Spinner /> : null}
        </button>
      ))}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
