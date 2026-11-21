"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { MEAL_TYPES, cap, type MealTypeName } from "@/lib/vocab";
import BowlArt from "@/components/BowlArt";
import Sheet from "@/components/Sheet";
import { EatRecipeSheet } from "@/components/MealSheets";
import { Button, Chip, ErrorText, Spinner, cx } from "@/components/ui";

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
  const [favorite, setFavorite] = useState(false);
  const [tab, setTab] = useState<"ingr" | "method">("ingr");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [eating, setEating] = useState(false);
  const [logged, setLogged] = useState(false);

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
          <div className="flex flex-col gap-2.5">
            <Button onClick={() => setPicking(true)}>Use on a day</Button>
            <Button variant="outline" onClick={() => setEating(true)}>I ate this</Button>
            {logged && <p className="text-[13px]" style={{ color: "#15803D" }}>Logged. It counts toward your calories.</p>}
          </div>
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
      {eating && recipe && <EatRecipeSheet recipeId={recipe.id} name={recipe.name} calories={recipe.calories} onClose={() => setEating(false)} onSaved={() => { setEating(false); setLogged(true); }} />}
      {picking && recipe && <DaySheet recipeId={recipe.id} onClose={() => setPicking(false)} />}
    </main>
  );
}

type DayEntry = { id: string; mealType: string; position: number; recipe: { name: string } };
type Day = { date: string; entries: DayEntry[] };

const dayLabel = (iso: string, long = false) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, long ? { weekday: "long", month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" });

/**
 * Put this recipe on a day of this week's plan. Two choices: add it as another meal (nothing is replaced), or replace
 * one of that day's meals (which also removes an "I ate it" log on the meal that was replaced). The server re-checks the
 * recipe against allergies and diet either way.
 */
function DaySheet({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState<Day[] | null>(null);
  const [eaten, setEaten] = useState<Set<string>>(new Set()); // plan entries the user logged as eaten
  const [picked, setPicked] = useState<string | null>(null); // the chosen day
  const [mealType, setMealType] = useState<MealTypeName>("dinner");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { plan } = await api<{ plan: { weekStart: string; entries: (DayEntry & { date: string })[] } }>("/api/plan");
        const start = new Date(`${plan.weekStart.slice(0, 10)}T12:00:00`);
        const list: Day[] = Array.from({ length: 7 }, (_, n) => {
          const d = new Date(start);
          d.setDate(start.getDate() + n);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return { date: iso, entries: plan.entries.filter((e) => e.date.slice(0, 10) === iso).sort((a, b) => a.position - b.position) };
        });
        setDays(list);
        const today = new Date();
        const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (list[0].date <= todayIso) {
          const { logs } = await api<{ logs: { entryId: string | null; status: string }[] }>(`/api/meal-logs?from=${list[0].date}&to=${todayIso}`).catch(() => ({ logs: [] }));
          setEaten(new Set(logs.filter((l) => l.entryId && (l.status === "eaten_as_planned" || l.status === "modified")).map((l) => l.entryId as string)));
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  function fail(e: unknown) {
    setError(e instanceof ApiError && e.status === 422 ? "This recipe doesn't fit your allergies or diet, so it can't be added." : (e as Error).message);
    setBusy(null);
  }

  async function addTo(date: string) {
    setBusy("add");
    setError(null);
    try {
      await api("/api/plan/entries", { method: "POST", json: { date, mealType, recipeId } });
      onClose();
      router.push("/today");
    } catch (e) {
      fail(e);
    }
  }

  async function replace(entryId: string) {
    setBusy(entryId);
    setError(null);
    try {
      await api("/api/swap", { method: "POST", json: { entryId, recipeId } });
      onClose();
      router.push("/today");
    } catch (e) {
      fail(e);
    }
  }

  const day = days?.find((d) => d.date === picked) ?? null;

  return (
    <Sheet title={day ? dayLabel(day.date, true) : "Use on a day"} onClose={onClose}>
      {!days && !error && <div className="flex justify-center py-6"><Spinner /></div>}
      {days && !day && (
        <>
          <p className="mb-3 text-[14px] leading-relaxed text-ink-muted">Pick a day. Next you choose to add it as another meal or replace one. It&apos;s checked against your allergies and diet first.</p>
          {days.map((d) => (
            <button key={d.date} type="button" onClick={() => setPicked(d.date)} className="flex w-full items-center gap-3 border-t border-line py-3 text-left">
              <span className="w-[112px] flex-none text-[15px] font-semibold">{dayLabel(d.date)}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink-muted">{d.entries.length ? d.entries.map((e) => e.recipe.name).join(" · ") : "No meals yet"}</span>
            </button>
          ))}
        </>
      )}
      {day && (
        <>
          <button type="button" onClick={() => { setPicked(null); setError(null); }} className="mb-3 text-[14px] font-semibold text-brand">‹ All days</button>
          <p className="mb-2 text-[14px] font-semibold">Add as another meal</p>
          <p className="mb-2.5 text-[13px] text-ink-muted">Keeps everything already on {dayLabel(day.date)}, including what you logged.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={mealType === m} onClick={() => setMealType(m)} />)}
          </div>
          <Button loading={busy === "add"} disabled={busy !== null} onClick={() => addTo(day.date)}>Add to {dayLabel(day.date)}</Button>
          {day.entries.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-[14px] font-semibold">Or replace one</p>
              <p className="mb-1 text-[13px] text-ink-muted">Use this if you won&apos;t eat that meal. Replacing removes any &quot;ate it&quot; log on it.</p>
              {day.entries.map((e) => (
                <button key={e.id} type="button" disabled={busy !== null} onClick={() => replace(e.id)} className={cx("flex w-full items-center gap-3 border-t border-line py-3 text-left", busy && busy !== e.id && "opacity-40")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{e.recipe.name}</span>
                    <span className="block text-[12px] text-ink-muted">{cap(e.mealType)}{eaten.has(e.id) ? " · logged as eaten, replacing removes the log" : ""}</span>
                  </span>
                  <span className="flex-none text-[14px] font-semibold text-brand">{busy === e.id ? "…" : "Replace"}</span>
                </button>
              ))}
            </>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
