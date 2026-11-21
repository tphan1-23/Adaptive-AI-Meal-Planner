"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Entry, MealLog, Plan, Profile, WeighIn } from "@/lib/api-types";
import { addDays, dayKey, isoDay, parseDay } from "@/lib/dates";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { cap } from "@/lib/vocab";
import BowlArt from "@/components/BowlArt";
import { FoodSheet, LogMealSheet } from "@/components/MealSheets";
import Sheet from "@/components/Sheet";
import { BottomNav, Button, ErrorText, Spinner, cx } from "@/components/ui";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SwapResult = { entry: Entry; reason: string; matchedRequest: boolean | null };
type Adjustment = { changed: boolean; newTarget: number; reason: string } | null;
type SwapOption = { recipeId: string; name: string; calories: number; proteinG: number | null; tags: string[]; note: string; imageUrl: string | null };
type OptionsResult = { options: SwapOption[]; matchedRequest: boolean | null; note: string | null };

export default function TodayPage() {
  const todayKey = isoDay(new Date());
  const tomorrowKey = isoDay(addDays(new Date(), 1));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [selected, setSelected] = useState(todayKey);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [swapFor, setSwapFor] = useState<Entry | null>(null);
  const [logFor, setLogFor] = useState<Entry | null>(null);
  const [foodOpen, setFoodOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [initial, setInitial] = useState("");

  const load = useCallback(async () => {
    setState((s) => (s === "ready" ? s : "loading")); // keep showing the old data while refreshing
    try {
      const [p, l] = await Promise.all([api<{ profile: Profile | null }>("/api/profile"), api<{ logs: WeighIn[] }>("/api/logs")]);
      if (!p.profile) {
        window.location.assign("/onboarding");
        return;
      }
      setProfile(p.profile);
      setWeighIns(l.logs);
      try {
        setPlan((await api<{ plan: Plan }>("/api/plan")).plan);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
        setPlan((await api<{ plan: Plan }>("/api/plan", { method: "POST", json: {} })).plan); // no plan yet
      }
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        window.location.assign("/onboarding");
        return;
      }
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
    createSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setInitial((data.user?.email ?? "?").charAt(0).toUpperCase()))
      .catch(() => setInitial("?"));
  }, [load]);

  const days = useMemo(() => {
    if (!plan) return [];
    const start = parseDay(plan.weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [plan]);

  const selectedKey = days.length && !days.some((d) => isoDay(d) === selected) ? isoDay(days[0]) : selected;
  const entries = (plan?.entries ?? []).filter((e) => dayKey(e.date) === selectedKey).sort((a, b) => a.position - b.position);
  const selectedDate = parseDay(selectedKey);
  const canLog = selectedKey <= tomorrowKey; // the API refuses logs for days after tomorrow

  // What was eaten on the selected day (planned meals logged + other food).
  const loadLogs = useCallback(async () => {
    try {
      setLogs((await api<{ logs: MealLog[] }>(`/api/meal-logs?from=${selectedKey}&to=${selectedKey}`)).logs);
    } catch {
      setLogs([]);
    }
  }, [selectedKey]);
  useEffect(() => {
    if (state === "ready") loadLogs();
  }, [state, loadLogs]);

  function applySwap(res: SwapResult) {
    setPlan((p) => (p ? { ...p, entries: p.entries.map((e) => (e.id === res.entry.id ? res.entry : e)) } : p));
    setReasons((r) => ({ ...r, [res.entry.id]: res.reason }));
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-14">
        <div className="flex items-end justify-between">
          <div>
            <p className="mb-1 text-[14px] text-ink-muted">{selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1 className="text-[34px] font-semibold leading-none tracking-tight">{selectedKey === todayKey ? "Today" : selectedDate.toLocaleDateString(undefined, { weekday: "long" })}</h1>
          </div>
          <Link href="/settings" aria-label="Account and settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-[15px] font-semibold">
            {initial}
          </Link>
        </div>

        {state === "loading" && <div className="flex justify-center py-16"><Spinner /></div>}
        {state === "error" && (
          <div>
            <ErrorText>{error}</ErrorText>
            <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
          </div>
        )}

        {state === "ready" && plan && profile && (
          <>
            <nav aria-label="This week" className="flex">
              {days.map((d) => {
                const key = isoDay(d);
                const on = key === selectedKey;
                return (
                  <button key={key} type="button" onClick={() => setSelected(key)} aria-current={key === todayKey ? "date" : undefined} aria-pressed={on} className={cx("flex flex-1 flex-col items-center gap-1.5 text-[12px]", on ? "font-medium text-ink" : "text-ink-muted")}>
                    {DAY[d.getDay()]}
                    <span className={cx("flex h-[38px] w-[38px] items-center justify-center rounded-full text-[15px] font-medium", on ? "bg-brand text-white" : key === todayKey ? "border border-brand text-ink" : "text-ink")}>{d.getDate()}</span>
                  </button>
                );
              })}
            </nav>

            {entries.length === 0 && <p className="py-8 text-center text-[15px] text-ink-muted">Nothing planned for this day.</p>}
            {entries.map((e) => (
              <MealCard key={e.id} entry={e} profile={profile} target={plan.calorieTarget} reason={reasons[e.id]} logged={logs.find((l) => l.entryId === e.id)} canLog={canLog} onSwap={() => setSwapFor(e)} onLog={() => setLogFor(e)} />
            ))}

            <Button variant="outline" onClick={() => setGenOpen(true)}>Create a new recipe for me</Button>

            <EatenToday logs={logs} target={profile.calorieTarget} canLog={canLog} onAdd={() => setFoodOpen(true)} onRemoved={loadLogs} />

            <WeighInCard
              last={weighIns[0]}
              onSaved={(log, adj) => {
                setWeighIns((w) => [log, ...w]);
                if (adj?.changed) setProfile((p) => (p ? { ...p, calorieTarget: adj.newTarget } : p));
              }}
            />
          </>
        )}
      </main>

      {swapFor && (
        <SwapSheet
          entry={swapFor}
          onClose={() => setSwapFor(null)}
          onSwapped={(res) => {
            applySwap(res);
            setSwapFor(null);
            loadLogs();
          }}
        />
      )}
      {logFor && (
        <LogMealSheet
          entryId={logFor.id}
          recipeId={logFor.recipe.id}
          planned={Math.round(logFor.recipe.calories)}
          existing={logs.find((l) => l.entryId === logFor.id) ?? null}
          onClose={() => setLogFor(null)}
          onSaved={() => {
            setLogFor(null);
            loadLogs();
          }}
        />
      )}
      {genOpen && (
        <GenerateSheet
          date={selectedKey}
          onClose={() => setGenOpen(false)}
          onCreated={() => {
            setGenOpen(false);
            load(); // the new recipe is an extra meal on this day
          }}
        />
      )}
      {foodOpen && (
        <FoodSheet
          date={selectedKey}
          onClose={() => setFoodOpen(false)}
          onSaved={() => {
            setFoodOpen(false);
            loadLogs();
          }}
        />
      )}
      <BottomNav />
    </>
  );
}

function MealCard({ entry, profile, target, reason, logged, canLog, onSwap, onLog }: { entry: Entry; profile: Profile; target: number; reason?: string; logged?: MealLog; canLog: boolean; onSwap: () => void; onLog: () => void }) {
  const r = entry.recipe;
  const tags = [profile.diet ? cap(profile.diet) : null, ...profile.allergies.map((a) => `${cap(a)} free`), cap(entry.mealType)].filter(Boolean);
  const share = Math.min(100, Math.round((r.calories / Math.max(1, target)) * 100));
  const macro = (label: string, value: number | null, unit: string, accent?: boolean) => (
    <div>
      <div className="text-[12px] text-ink-muted">{label}</div>
      <div className={cx("text-[19px] font-semibold", accent && "text-brand")}>
        {value === null ? "–" : Math.round(value)}
        {unit}
      </div>
    </div>
  );
  const status = logged ? (logged.status === "skipped" ? "Skipped" : logged.status === "modified" ? `Changed · ${Math.round(logged.calories)} kcal` : "Ate it") : null;

  return (
    <section aria-label="Recommended recipe" className="flex flex-col gap-3.5">
      <Link href={`/recipes/${entry.id}`} aria-label={`Open ${r.name}`} className="flex h-[210px] items-center justify-center overflow-hidden rounded-[28px] bg-surface">
        <BowlArt name={r.name} tags={r.tags} imageUrl={r.imageUrl} />
      </Link>
      <p className="text-[13px] text-ink-muted">
        {r.source === "ai" ? <span className="font-semibold text-brand-dark">AI-made · </span> : null}
        {tags.join(" · ")}
      </p>
      <h2 className="text-[26px] font-semibold leading-tight tracking-tight">{r.name}</h2>
      {reason && <p className="text-[15px] leading-relaxed text-ink-muted">{reason}</p>}
      <div className="grid grid-cols-4 gap-2 border-y border-line py-3">
        {macro("kcal", r.calories, "", true)}
        {macro("Protein", r.proteinG, "g")}
        {macro("Carbs", r.carbsG, "g")}
        {macro("Fat", r.fatG, "g")}
      </div>
      <div>
        <div className="h-1 rounded-sm bg-line"><div className="h-1 rounded-sm bg-brand" style={{ width: `${share}%` }} /></div>
        <div className="mt-2 text-[13px] text-ink-muted">This meal is {share}% of your daily target</div>
      </div>
      <div className="flex gap-2.5">
        <Link href={`/recipes/${entry.id}`} className="flex h-[52px] flex-1 items-center justify-center rounded-full bg-brand font-semibold text-white hover:bg-brand-dark">Open recipe</Link>
        <button type="button" onClick={onSwap} className="h-[52px] flex-1 rounded-full border border-ink bg-white font-semibold hover:bg-surface">Swap it</button>
      </div>
      {canLog && <Button variant="outline" onClick={onLog}>{status ? `Logged: ${status} (edit)` : "Log this meal"}</Button>}
    </section>
  );
}

/** What was eaten on the selected day against the target, with a button to add other food. */
function EatenToday({ logs, target, canLog, onAdd, onRemoved }: { logs: MealLog[]; target: number; canLog: boolean; onAdd: () => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const eaten = logs.reduce((sum, l) => sum + (l.status === "skipped" ? 0 : l.calories), 0);
  const pct = Math.min(100, Math.round((eaten / Math.max(1, target)) * 100));
  const label = (l: MealLog) =>
    l.status === "ad_hoc" ? (l.note ? l.note : `${cap(l.mealType ?? "Food")} (other food)`) : `${l.recipe?.name ?? "Planned meal"}${l.status === "skipped" ? " (skipped)" : l.status === "modified" ? " (changed)" : ""}`;

  async function remove(l: MealLog) {
    setBusy(l.id);
    try {
      await api("/api/meal-logs", { method: "DELETE", json: { id: l.id } });
      onRemoved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Eaten today" className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold">Eaten so far</h2>
        <span className="text-[16px] font-semibold">{Math.round(eaten).toLocaleString()} <span className="font-normal text-ink-muted">of {target.toLocaleString()} kcal</span></span>
      </div>
      <div className="h-1 rounded-sm bg-line"><div className={cx("h-1 rounded-sm", eaten > target ? "bg-brand-dark" : "bg-brand")} style={{ width: `${pct}%` }} /></div>
      {logs.length === 0 && <p className="text-[14px] text-ink-muted">Nothing logged yet.</p>}
      {logs.map((l) => (
        <div key={l.id} className="flex min-h-[44px] items-center gap-3">
          <span className="flex-1 text-[15px]">{label(l)}</span>
          <span className="text-[15px] font-medium text-ink-muted">{l.status === "skipped" ? "0" : Math.round(l.calories)}</span>
          <button type="button" aria-label="Remove this entry" disabled={busy === l.id} onClick={() => remove(l)} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-[13px] disabled:opacity-40">✕</button>
        </div>
      ))}
      {canLog && <Button variant="outline" onClick={onAdd}>Log other food</Button>}
    </section>
  );
}

function SwapSheet({ entry, onClose, onSwapped }: { entry: Entry; onClose: () => void; onSwapped: (r: SwapResult) => void }) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState(""); // the request the shown options are for
  const [res, setRes] = useState<OptionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const status = e instanceof ApiError ? e.status : 0;
    setError(status === 429 ? "Please wait a minute and try again." : status === 422 ? "No other recipe fits right now. Try different words." : (e as Error).message);
  };

  const find = useCallback(
    async (request: string) => {
      setLoading(true);
      setError(null);
      try {
        setRes(await api<OptionsResult>("/api/swap/options", { method: "POST", json: { entryId: entry.id, ...(request ? { request } : {}) } }));
        setAsked(request);
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    },
    [entry.id],
  );

  useEffect(() => {
    find("");
  }, [find]);

  async function choose(o: SwapOption) {
    setChoosing(o.recipeId);
    setError(null);
    try {
      onSwapped(await api<SwapResult>("/api/swap", { method: "POST", json: { entryId: entry.id, recipeId: o.recipeId, ...(asked ? { request: asked } : {}) } }));
    } catch (e) {
      fail(e);
      setChoosing(null);
      find(asked); // the pool may have changed: refresh the list
    }
  }

  return (
    <Sheet title="Swap today's pick" onClose={onClose}>
      <p className="mb-3.5 text-[14px] leading-relaxed text-ink-muted">Close matches from your safe recipes, ranked by calories and your tastes.</p>
      {loading && <div className="flex justify-center py-7"><Spinner /></div>}
      {!loading && res?.note && <p className="mb-2 text-[13px] text-ink-muted">{res.note}</p>}
      {!loading &&
        res?.options.map((o) => (
          <button key={o.recipeId} type="button" disabled={choosing !== null} onClick={() => choose(o)} aria-label={`Swap to ${o.name}, ${Math.round(o.calories)} calories`} className={cx("flex w-full items-center gap-3.5 border-t border-line py-3.5 text-left", choosing && choosing !== o.recipeId && "opacity-40")}>
            <span className="flex h-[52px] w-[52px] flex-none items-center justify-center overflow-hidden rounded-2xl bg-surface"><BowlArt size={36} name={o.name} tags={o.tags} imageUrl={o.imageUrl} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">{o.name}</span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">{o.note}</span>
            </span>
            {choosing === o.recipeId ? <Spinner /> : <strong className="text-[15px] font-semibold">{Math.round(o.calories)}</strong>}
          </button>
        ))}
      <form className="flex items-center gap-2.5 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); if (!loading) find(text.trim()); }}>
        <label htmlFor="swap-ask" className="sr-only">Describe what you want instead</label>
        <input id="swap-ask" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Or describe it, like no beans" className="h-[50px] min-w-0 flex-1 rounded-full border border-line px-[18px] text-[15px] outline-none focus:border-ink" />
        <button type="submit" disabled={loading} aria-label="Find options" className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-full bg-brand text-white disabled:opacity-50">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}

/** Ask the AI to create a brand-new private recipe from the user's tastes, optionally with a wish, and add it to the day. */
function GenerateSheet({ date, onClose, onCreated }: { date: string; onClose: () => void; onCreated: () => void }) {
  const [wish, setWish] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/generate", { method: "POST", json: { date, mealType: "dinner", ...(wish.trim() ? { wish: wish.trim() } : {}) } });
      onCreated();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(status === 429 ? "You've reached today's limit for new recipes, or the AI is busy. Try again later." : status === 422 ? "We couldn't make a safe recipe this time. Please try again." : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Create a recipe" onClose={onClose}>
      <p className="mb-3.5 text-[14px] leading-relaxed text-ink-muted">The AI writes a new recipe from the tastes the planner has learned. Calories come from ingredient data, and it is checked against your allergies and diet. It&apos;s private to you.</p>
      <label htmlFor="wish" className="sr-only">What do you feel like</label>
      <input id="wish" value={wish} maxLength={200} onChange={(e) => setWish(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && create()} placeholder="Optional: something spicy with noodles" className="mb-3 h-[50px] w-full rounded-full border border-line px-[18px] text-[15px] outline-none focus:border-ink" />
      <Button loading={busy} onClick={create}>Create recipe</Button>
      {busy && <p className="mt-3 text-center text-[13px] text-ink-muted">This can take up to 30 seconds.</p>}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}

/** Weight entry. Always available; highlighted when a weekly weigh-in is due (the target adapts from these). */
function WeighInCard({ last, onSaved }: { last?: WeighIn; onSaved: (log: WeighIn, adj: Adjustment) => void }) {
  const [value, setValue] = useState(last ? String(last.weightKg) : "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const daysSince = last ? Math.floor((Date.now() - new Date(last.loggedAt).getTime()) / 86_400_000) : Infinity;
  const due = daysSince >= 6;
  const ago = daysSince === Infinity ? "no weigh-in yet" : daysSince === 0 ? "logged today" : `logged ${daysSince} day${daysSince === 1 ? "" : "s"} ago`;

  async function save() {
    const weightKg = Number(value.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) return setError("Enter a weight between 30 and 300 kg.");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ log: WeighIn; adjustment: Adjustment }>("/api/logs", { method: "POST", json: { weightKg } });
      setMessage(res.adjustment?.reason ?? "Weigh-in saved.");
      setOpen(false);
      onSaved(res.log, res.adjustment);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Weigh-in" className={cx("rounded-[20px] px-5 py-[18px]", due ? "bg-brand-soft" : "bg-surface")}>
      <div className="text-[16px] font-semibold">{due ? "Weekly weigh-in is due" : "Weight"}</div>
      <div className="mt-1 text-[14px] text-ink-muted">{last ? `${last.weightKg} kg, ${ago}` : "No weigh-in yet"}</div>
      {message && !open && <p className="mt-1.5 text-[14px] text-ink-muted">{message}</p>}
      {open || due ? (
        <div className="mt-3 flex gap-2.5">
          <label htmlFor="wt" className="sr-only">Weight in kg</label>
          <input id="wt" value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} placeholder="kg" className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[16px] outline-none focus:border-ink" />
          <button type="button" onClick={save} disabled={busy} className="h-12 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-40">Log kg</button>
        </div>
      ) : (
        <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>Log a weigh-in</Button>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
