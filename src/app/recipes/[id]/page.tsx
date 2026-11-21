"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Entry, MealLog, Profile } from "@/lib/api-types";
import { addDays, dayKey, isoDay } from "@/lib/dates";
import { EQUIPMENT, cap, niceName, toggle } from "@/lib/vocab";
import BowlArt from "@/components/BowlArt";
import { LogMealSheet } from "@/components/MealSheets";
import Sheet from "@/components/Sheet";
import { Button, Chip, ErrorText, Spinner, cx } from "@/components/ui";

type Recipe = {
  id: string;
  name: string;
  source?: string;
  calories: number;
  proteinG: number | null;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
  tags: string[];
  equipment: string[];
  imageUrl: string | null;
  isFavorite: boolean;
};
type Detail = {
  entry: Entry;
  recipe: Recipe;
  convertedSteps: string[];
  convertedForEquipment: string[];
  modifiedRecipe: (Partial<Recipe> & { request?: string; caloriesVerified?: boolean }) | null;
};
type Substitute = { name: string; quality: "close" | "rough"; grams: number; note: string };

// Dataset recipes carry placeholder quantities ("1 item"): show only real ones.
const qty = (i: Recipe["ingredients"][number]) => (i.unit === "item" ? "" : `${+i.quantity.toFixed(2)} ${i.unit}`);

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [existingLog, setExistingLog] = useState<MealLog | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ingr" | "method">("method");
  const [showOriginal, setShowOriginal] = useState(false);
  const [cookWith, setCookWith] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [swapIngredient, setSwapIngredient] = useState<string | null>(null);
  const [changeText, setChangeText] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeNote, setChangeNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [d, p] = await Promise.all([api<Detail>(`/api/entries/${id}`), api<{ profile: Profile | null }>("/api/profile")]);
      setDetail(d);
      setProfile(p.profile);
      setFavorite(d.recipe.isFavorite);
      setCookWith(d.convertedForEquipment.length > 0 ? d.convertedForEquipment : (p.profile?.equipment ?? []));
      const day = dayKey(d.entry.date);
      const logs = await api<{ logs: MealLog[] }>(`/api/meal-logs?from=${day}&to=${day}`).catch(() => ({ logs: [] as MealLog[] }));
      setExistingLog(logs.logs.find((l) => l.entryId === d.entry.id) ?? null);
      setState("ready");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "We couldn't find that meal." : (e as Error).message);
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function convert() {
    if (cookWith.length === 0) return setConvertNote("Pick at least one appliance to cook with.");
    setConverting(true);
    setConvertNote(null);
    try {
      const res = await api<{ available: boolean; steps: string[]; note: string; equipment: string[] }>("/api/convert", { method: "POST", json: { entryId: id, equipment: cookWith } });
      if (!res.available) setConvertNote(res.note || "We couldn't convert this one right now. The original steps are shown.");
      else setDetail((d) => (d ? { ...d, convertedSteps: res.steps, convertedForEquipment: res.equipment ?? cookWith } : d));
      setShowOriginal(false);
    } catch (e) {
      setConvertNote(e instanceof ApiError && e.status === 429 ? "Please wait a minute and try again." : (e as Error).message);
    } finally {
      setConverting(false);
    }
  }

  async function applyChange() {
    const request = changeText.trim();
    if (request.length < 3) return setChangeNote("Describe the change in at least a few words.");
    setChanging(true);
    setChangeNote(null);
    try {
      await api("/api/modify", { method: "POST", json: { entryId: id, request } });
      setChangeText("");
      setShowOriginal(false);
      await load();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setChangeNote(status === 422 ? "That change couldn't be made safely for you. Try different wording." : status === 429 ? "Please wait a minute and try again." : (e as Error).message);
    } finally {
      setChanging(false);
    }
  }

  async function undoChange() {
    setChanging(true);
    try {
      await api("/api/modify", { method: "DELETE", json: { entryId: id } });
      await load();
    } catch (e) {
      setChangeNote((e as Error).message);
    } finally {
      setChanging(false);
    }
  }

  async function toggleFavorite() {
    if (!detail) return;
    const next = !favorite;
    setFavorite(next); // update right away, undo if it fails
    try {
      await api("/api/favorites", { method: next ? "POST" : "DELETE", json: { recipeId: detail.recipe.id } });
    } catch {
      setFavorite(!next);
    }
  }

  const back = (
    <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))} className="-ml-2.5 flex h-11 w-11 items-center justify-center">
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5 8 12l7 7" /></svg>
    </button>
  );

  if (state !== "ready" || !detail) {
    return (
      <main className="flex-1 px-5 pt-12">
        {back}
        {state === "loading" ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <div>
            <ErrorText>{error}</ErrorText>
            <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
          </div>
        )}
      </main>
    );
  }

  const { recipe, entry } = detail;
  const shown = { ...recipe, ...(detail.modifiedRecipe ?? {}) } as Recipe; // the user's own version wins
  const converted = detail.convertedSteps.length > 0 && !showOriginal;
  const steps = converted ? detail.convertedSteps : shown.steps ?? [];
  const safeFor = (profile?.allergies ?? []).map(cap);
  const canLog = dayKey(entry.date) <= isoDay(addDays(new Date(), 1));
  const needs = (shown.equipment ?? []).filter((e) => !(profile?.equipment ?? []).includes(e));

  return (
    <>
      <main className="flex-1 px-5 pb-6 pt-12">
        <div className="flex items-center justify-between">
          {back}
          <button type="button" aria-label={favorite ? "Remove from saved recipes" : "Save recipe"} aria-pressed={favorite} onClick={toggleFavorite} className="-mr-2.5 flex h-11 w-11 items-center justify-center">
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill={favorite ? "#D92D20" : "none"} stroke={favorite ? "#D92D20" : "currentColor"} strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
          </button>
        </div>

        <div className="mb-4 flex h-[200px] items-center justify-center overflow-hidden rounded-[28px] bg-surface">
          <BowlArt size={170} name={shown.name} tags={shown.tags} imageUrl={recipe.imageUrl} />
        </div>
        {recipe.source === "ai" && <span className="mb-2 inline-block rounded-xl bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand-dark">AI-made recipe</span>}
        <h1 className="mb-2.5 text-[30px] font-semibold leading-tight tracking-tight">{shown.name}</h1>
        <p className="mb-4 text-[15px] text-ink-muted">
          {entry.mealType ? `${cap(entry.mealType)} · ` : ""}
          <span className="font-semibold text-brand">{Math.round(shown.calories)} kcal</span>
          {shown.proteinG != null ? ` · ${Math.round(shown.proteinG)} g protein` : ""}
        </p>

        <div className="mb-5 flex items-center gap-2.5 rounded-[14px] bg-surface p-3.5">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="flex-none"><path d="M4 12.5 9.5 18 20 6" /></svg>
          <span className="text-[13px] leading-relaxed text-ink-muted">
            <strong className="font-semibold text-ink">{safeFor.length ? "Safe for you. " : "Matches your plan. "}</strong>
            {safeFor.length ? `Checked for ${safeFor.join(", ").toLowerCase()}, twice.` : "Checked against your eating style."}
          </span>
        </div>

        <div role="tablist" className="mb-2 flex rounded-[14px] p-1" style={{ backgroundColor: "#F3F3F1" }}>
          {(["ingr", "method"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-11 flex-1 rounded-[11px] text-[15px]", tab === t ? "bg-white font-semibold text-ink" : "font-medium text-ink-muted")}>
              {t === "ingr" ? "Ingredients" : "Method"}
            </button>
          ))}
        </div>

        {tab === "ingr" ? (
          <div className="border-b border-line">
            {(shown.ingredients ?? []).map((i, n) => (
              <div key={`${i.name}-${n}`} className="flex min-h-[56px] items-center gap-2.5 border-t border-line py-2.5">
                <div className="flex-1">
                  <div className="text-[16px]">{cap(i.name)}</div>
                  {qty(i) && <div className="text-[13px] text-ink-muted">{qty(i)}</div>}
                </div>
                <button type="button" aria-label={`Find a swap for ${i.name}`} onClick={() => setSwapIngredient(i.name)} className="h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold">Swap</button>
              </div>
            ))}
            <Link href="/shopping-list" className="my-4 flex h-[50px] items-center justify-center rounded-full border border-ink font-semibold">See shopping list</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            <div className="rounded-[18px] bg-surface p-4">
              <p className="text-[15px] font-semibold">Cook it a different way</p>
              <p className="mb-3 mt-1 text-[13px] text-ink-muted">
                {needs.length > 0 ? `This recipe uses ${needs.map(niceName).join(", ").toLowerCase()}. ` : ""}
                Pick what you want to use and we&apos;ll rewrite the steps for it.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(EQUIPMENT).map(([k, label]) => <Chip key={k} label={label} selected={cookWith.includes(k)} onClick={() => setCookWith(toggle(cookWith, k))} />)}
              </div>
              <Button loading={converting} onClick={convert}>{detail.convertedSteps.length > 0 ? "Convert again" : "Convert steps"}</Button>
              {converting && <p className="mt-2 text-[13px] text-ink-muted">This can take up to 30 seconds.</p>}
              {convertNote && <p className="mt-2 text-[13px] text-ink-muted">{convertNote}</p>}
            </div>

            <div className="rounded-[18px] bg-surface p-4">
              <p className="text-[15px] font-semibold">Change this recipe</p>
              {detail.modifiedRecipe ? (
                <>
                  <p className="mb-3 mt-1 text-[13px] text-ink-muted">
                    Your version: &quot;{detail.modifiedRecipe.request}&quot;. Allergies were re-checked.
                    {detail.modifiedRecipe.caloriesVerified === false ? " Calories could not be re-checked, so the original number is shown." : ""}
                  </p>
                  <Button variant="outline" loading={changing} onClick={undoChange}>Undo my change</Button>
                </>
              ) : (
                <>
                  <p className="mb-3 mt-1 text-[13px] text-ink-muted">Say what to change, like &quot;make it vegetarian&quot; or &quot;less spicy&quot;. It only changes your copy.</p>
                  <label htmlFor="change" className="sr-only">Describe the change</label>
                  <input id="change" value={changeText} maxLength={200} onChange={(e) => setChangeText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !changing && applyChange()} placeholder="Make it vegetarian" className="mb-3 h-[50px] w-full rounded-full border border-line bg-white px-[18px] text-[15px] outline-none focus:border-ink" />
                  <Button loading={changing} onClick={applyChange}>Apply change</Button>
                  {changing && <p className="mt-2 text-[13px] text-ink-muted">This can take up to 30 seconds.</p>}
                </>
              )}
              {changeNote && <p className="mt-2 text-[13px] text-ink-muted">{changeNote}</p>}
            </div>

            {detail.convertedSteps.length > 0 && (
              <div className={cx("rounded-[18px] p-4", converted ? "bg-brand-soft" : "bg-surface")}>
                <p className="text-[14px] leading-relaxed">
                  <strong className={cx("font-semibold", converted && "text-brand-dark")}>{converted ? `Converted for ${detail.convertedForEquipment.map((e) => e.replace("-", " ")).join(", ")}. ` : "Original steps. "}</strong>
                  <span className="text-ink-muted">{converted ? "The AI adjusted the steps, so check times the first time." : "Tap below to see the converted steps again."}</span>
                </p>
                <Button variant="outline" className="mt-3" onClick={() => setShowOriginal(converted)}>{converted ? "Show original" : "Show converted"}</Button>
              </div>
            )}

            {steps.length === 0 && <p className="py-4 text-[14px] text-ink-muted">No steps for this recipe.</p>}
            {steps.map((s, n) => (
              <div key={n} className="flex gap-4 border-t border-line py-[18px]">
                <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[14px] font-semibold" style={{ backgroundColor: "#F3F3F1" }}>{n + 1}</span>
                <p className="flex-1 text-[16px] leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="sticky bottom-0 border-t border-line bg-white px-5 pb-6 pt-3">
        <Button onClick={() => setLogOpen(true)} disabled={!canLog}>
          {existingLog ? `Logged: ${existingLog.status === "skipped" ? "skipped" : existingLog.status === "modified" ? "changed" : "ate it"} (edit)` : "Log this meal"}
        </Button>
        {!canLog && <p className="mt-2 text-center text-[13px] text-ink-muted">You can log a meal up to tomorrow.</p>}
      </div>

      {logOpen && <LogMealSheet entryId={entry.id} recipeId={recipe.id} planned={Math.round(shown.calories)} existing={existingLog} onClose={() => setLogOpen(false)} onSaved={(l) => { setExistingLog(l); setLogOpen(false); }} />}
      {swapIngredient && <IngredientSheet entryId={entry.id} ingredient={swapIngredient} onClose={() => setSwapIngredient(null)} />}
    </>
  );
}

/** Suggested replacements for one ingredient: matched on calories and macros in code, never containing the user's allergens. */
function IngredientSheet({ entryId, ingredient, onClose }: { entryId: string; ingredient: string; onClose: () => void }) {
  const [subs, setSubs] = useState<Substitute[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ substitutes: Substitute[] }>("/api/substitute", { method: "POST", json: { entryId, ingredient } })
      .then((r) => setSubs(r.substitutes))
      .catch((e) => {
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 422 || status === 404) setSubs([]); // nothing we can match
        else setError(status === 429 ? "Please wait a minute and try again." : (e as Error).message);
      });
  }, [entryId, ingredient]);

  return (
    <Sheet title={`Swap ${ingredient}`} onClose={onClose}>
      <p className="mb-3 text-[14px] text-ink-muted">Close swaps by calories and nutrition, checked against your allergies and diet.</p>
      {!subs && !error && <div className="flex justify-center py-6"><Spinner /></div>}
      {subs && subs.length === 0 && <p className="py-3 text-[14px] text-ink-muted">No close swap for this one. It&apos;s best kept as it is.</p>}
      {subs?.map((s) => (
        <div key={s.name} className="flex flex-col gap-1 border-t border-line py-3">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold">{cap(s.name)}</span>
            {s.quality === "rough" && <span className="rounded-[10px] border border-line px-2 py-0.5 text-[12px] text-ink-muted">rougher match</span>}
          </div>
          <p className="text-[14px] text-ink-muted">{s.note}</p>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
