"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Entry, MealLog, Profile } from "@/lib/api-types";
import { addDays, dayKey, isoDay } from "@/lib/dates";
import Sheet from "@/components/Sheet";
import { Button, ErrorText, Spinner, cx } from "@/components/ui";

type Recipe = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
  equipment: string[];
};
type Detail = { entry: Entry; recipe: Recipe; convertedSteps: string[]; modifiedRecipe: Partial<Recipe> | null };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
  const [converting, setConverting] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [d, p] = await Promise.all([api<Detail>(`/api/entries/${id}`), api<{ profile: Profile | null }>("/api/profile")]);
      setDetail(d);
      setProfile(p.profile);
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
    setConverting(true);
    setConvertNote(null);
    try {
      const res = await api<{ available: boolean; steps: string[]; note: string }>("/api/convert", { method: "POST", json: { entryId: id } });
      if (!res.available) setConvertNote(res.note || "We couldn't convert this one right now. The original steps are shown.");
      else setDetail((d) => (d ? { ...d, convertedSteps: res.steps } : d));
      setShowOriginal(false);
    } catch (e) {
      setConvertNote(e instanceof ApiError && e.status === 429 ? "Please wait a minute and try again." : (e as Error).message);
    } finally {
      setConverting(false);
    }
  }

  async function toggleFavorite() {
    if (!detail) return;
    const next = !favorite;
    setFavorite(next); // update right away, undo if it fails
    try {
      if (next) await api("/api/signals", { method: "POST", json: { recipeId: detail.recipe.id, type: "favorite" } });
    } catch {
      setFavorite(!next);
    }
  }

  const back = (
    <button type="button" aria-label="Back to today" onClick={() => (window.history.length > 1 ? router.back() : router.push("/today"))} className="-ml-2.5 flex h-11 w-11 items-center justify-center">
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5 8 12l7 7" />
      </svg>
    </button>
  );

  if (state !== "ready" || !detail) {
    return (
      <main className="flex-1 px-5 pt-12">
        {back}
        {state === "loading" ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
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
  const mine = new Set(profile?.equipment ?? []);
  const missing = (shown.equipment ?? []).filter((e) => !mine.has(e));
  const safeFor = (profile?.allergies ?? []).map(cap);
  const canLog = dayKey(entry.date) <= isoDay(addDays(new Date(), 1));
  const hasKitchen = (profile?.equipment.length ?? 0) > 0;
  const nice = (list: string[]) => list.map((m) => m.replace("-", " ")).join(", ");

  return (
    <>
      <main className="flex-1 px-5 pb-6 pt-12">
        <div className="flex items-center justify-between">
          {back}
          <button type="button" aria-label="Favorite" aria-pressed={favorite} onClick={toggleFavorite} className="-mr-2.5 flex h-11 w-11 items-center justify-center">
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill={favorite ? "#D92D20" : "none"} stroke={favorite ? "#D92D20" : "currentColor"} strokeWidth="2" strokeLinejoin="round">
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
            </svg>
          </button>
        </div>

        <h1 className="mb-2.5 mt-2 text-[30px] font-semibold leading-tight tracking-tight">{shown.name}</h1>
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

        <div role="tablist" className="mb-2 flex rounded-[14px] bg-chip p-1" style={{ backgroundColor: "#F3F3F1" }}>
          {(["ingr", "method"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-11 flex-1 rounded-[11px] text-[15px]", tab === t ? "bg-white font-semibold text-ink" : "font-medium text-ink-muted")}>
              {t === "ingr" ? "Ingredients" : "Method"}
            </button>
          ))}
        </div>

        {tab === "ingr" ? (
          <div className="border-b border-line">
            {(shown.ingredients ?? []).map((i, n) => (
              <div key={`${i.name}-${n}`} className="flex justify-between border-t border-line py-3.5 text-[16px]">
                <span>{cap(i.name)}</span>
                <span className="text-ink-muted">{qty(i)}</span>
              </div>
            ))}
            <Link href="/shopping-list" className="my-4 flex h-[50px] items-center justify-center rounded-full border border-ink font-semibold">
              See shopping list
            </Link>
          </div>
        ) : (
          <div>
            {!converted && missing.length > 0 && detail.convertedSteps.length === 0 && (
              <div className="my-2 rounded-[18px] bg-surface p-4">
                <p className="text-[14px] leading-relaxed">
                  <strong className="font-semibold">This recipe uses {nice(missing)}. </strong>
                  <span className="text-ink-muted">{hasKitchen ? `Your kitchen has ${nice(profile?.equipment ?? [])}.` : "Add your equipment in onboarding to convert."}</span>
                </p>
                {hasKitchen && <Button className="mt-3" loading={converting} onClick={convert}>Convert for my kitchen</Button>}
                {converting && <p className="mt-2.5 text-[13px] text-ink-muted">This can take up to 30 seconds.</p>}
                {convertNote && <p className="mt-2.5 text-[13px] text-ink-muted">{convertNote}</p>}
              </div>
            )}
            {detail.convertedSteps.length > 0 && (
              <div className={cx("my-2 rounded-[18px] p-4", converted ? "bg-brand-soft" : "bg-surface")}>
                <p className="text-[14px] leading-relaxed">
                  <strong className={cx("font-semibold", converted && "text-brand-dark")}>{converted ? "Converted for your kitchen. " : "Original steps. "}</strong>
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

      {logOpen && (
        <LogSheet entryId={entry.id} planned={Math.round(shown.calories)} existing={existingLog} onClose={() => setLogOpen(false)} onSaved={(l) => { setExistingLog(l); setLogOpen(false); }} />
      )}
    </>
  );
}

function LogSheet({ entryId, planned, existing, onClose, onSaved }: { entryId: string; planned: number; existing: MealLog | null; onClose: () => void; onSaved: (l: MealLog | null) => void }) {
  const [changing, setChanging] = useState(false);
  const [kcal, setKcal] = useState(String(planned));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(status: "eaten_as_planned" | "skipped" | "modified") {
    const calories = Number(kcal);
    if (status === "modified" && !(Number.isFinite(calories) && calories >= 0 && calories <= 5000)) return setError("Enter calories between 0 and 5000.");
    setBusy(status);
    setError(null);
    try {
      const res = await api<{ log: MealLog }>("/api/meal-logs", { method: "POST", json: { entryId, status, ...(status === "modified" ? { calories } : {}) } });
      onSaved(res.log);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function undo() {
    if (!existing) return;
    setBusy("undo");
    try {
      await api("/api/meal-logs", { method: "DELETE", json: { id: existing.id } });
      onSaved(null);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <Sheet title="Log this meal" onClose={onClose}>
      <p className="mb-3.5 text-[14px] text-ink-muted">This feeds your Progress charts. You can change it later.</p>
      <div className="flex flex-col gap-2.5">
        <Button loading={busy === "eaten_as_planned"} onClick={() => save("eaten_as_planned")}>I ate it as planned</Button>
        {changing ? (
          <>
            <label htmlFor="kcal" className="sr-only">Calories you ate</label>
            <input id="kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className="h-[50px] rounded-full border border-line px-[18px] text-[16px] outline-none focus:border-ink" />
            <Button loading={busy === "modified"} onClick={() => save("modified")} className="bg-ink hover:bg-ink">Save what I ate</Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setChanging(true)}>I changed it</Button>
        )}
        <Button variant="outline" loading={busy === "skipped"} onClick={() => save("skipped")}>I skipped it</Button>
        {existing && <Button variant="outline" loading={busy === "undo"} onClick={undo}>Remove my log</Button>}
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
