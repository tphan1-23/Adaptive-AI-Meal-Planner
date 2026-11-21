"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Entry, Plan, Profile, WeighIn } from "@/lib/api-types";
import { addDays, dayKey, isoDay, parseDay } from "@/lib/dates";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import BowlArt from "@/components/BowlArt";
import Sheet from "@/components/Sheet";
import { BottomNav, Button, ErrorText, Spinner, cx } from "@/components/ui";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SwapResult = { entry: Entry; reason: string; matchedRequest: boolean | null };
type Adjustment = { changed: boolean; newTarget: number; reason: string } | null;

export default function TodayPage() {
  const todayKey = isoDay(new Date());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [selected, setSelected] = useState(todayKey);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({}); // entry id -> why it fits
  const [swapFor, setSwapFor] = useState<Entry | null>(null);
  const [initial, setInitial] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      // 409 = onboarding unfinished: the api helper does not redirect for it, so do it here.
      const [p, logs] = await Promise.all([
        api<{ profile: Profile | null }>("/api/profile"),
        api<{ logs: WeighIn[] }>("/api/logs"),
      ]);
      if (!p.profile) {
        window.location.assign("/onboarding");
        return;
      }
      setProfile(p.profile);
      setWeighIns(logs.logs);
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

  // The week strip: the 7 days of the plan, so the user can look at any day.
  const days = useMemo(() => {
    if (!plan) return [];
    const start = parseDay(plan.weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [plan]);

  // If today is outside the loaded week, fall back to its first day.
  useEffect(() => {
    if (days.length && !days.some((d) => isoDay(d) === selected)) setSelected(isoDay(days[0]));
  }, [days, selected]);

  const entries = (plan?.entries ?? []).filter((e) => dayKey(e.date) === selected).sort((a, b) => a.position - b.position);
  const selectedDate = parseDay(selected);
  const heading = selected === todayKey ? "Today" : selectedDate.toLocaleDateString(undefined, { weekday: "long" });

  function applySwap(res: SwapResult) {
    setPlan((p) => (p ? { ...p, entries: p.entries.map((e) => (e.id === res.entry.id ? res.entry : e)) } : p));
    setReasons((r) => ({ ...r, [res.entry.id]: res.reason }));
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-14">
        <div className="flex items-end justify-between">
          <div>
            <p className="mb-1 text-[14px] text-ink-muted">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="text-[34px] font-semibold leading-none tracking-tight">{heading}</h1>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await createSupabaseBrowser().auth.signOut();
              window.location.assign("/login");
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-[14px] font-semibold"
          >
            {initial}
          </button>
        </div>

        {state === "loading" && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {state === "error" && (
          <div>
            <ErrorText>{error}</ErrorText>
            <Button variant="outline" className="mt-4" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {state === "ready" && plan && profile && (
          <>
            <nav aria-label="This week" className="flex">
              {days.map((d) => {
                const key = isoDay(d);
                const on = key === selected;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-current={key === todayKey ? "date" : undefined}
                    aria-pressed={on}
                    className={cx("flex flex-1 flex-col items-center gap-1.5 text-[12px]", on ? "font-medium text-ink" : "text-ink-muted")}
                  >
                    {DAY[d.getDay()]}
                    <span
                      className={cx(
                        "flex h-[38px] w-[38px] items-center justify-center rounded-full text-[15px] font-medium",
                        on ? "bg-brand text-white" : key === todayKey ? "border border-brand text-ink" : "text-ink",
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </nav>

            {entries.length === 0 && <p className="py-8 text-center text-[15px] text-ink-muted">Nothing planned for this day.</p>}

            {entries.map((e) => (
              <MealCard
                key={e.id}
                entry={e}
                profile={profile}
                target={plan.calorieTarget}
                reason={reasons[e.id]}
                onSwap={() => setSwapFor(e)}
              />
            ))}

            <section aria-label="Daily target" className="border-t border-line pt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-ink-muted">Daily target</span>
                <strong className="text-[20px] font-semibold">{profile.calorieTarget.toLocaleString()} kcal</strong>
              </div>
            </section>

            <WeighInCard
              last={weighIns[0]}
              onSaved={(log, adjustment) => {
                setWeighIns((w) => [log, ...w]);
                if (adjustment?.changed) setProfile((p) => (p ? { ...p, calorieTarget: adjustment.newTarget } : p));
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
          }}
        />
      )}
      <BottomNav />
    </>
  );
}

function MealCard({
  entry,
  profile,
  target,
  reason,
  onSwap,
}: {
  entry: Entry;
  profile: Profile;
  target: number;
  reason?: string;
  onSwap: () => void;
}) {
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

  return (
    <section aria-label="Recommended recipe" className="flex flex-col gap-3.5">
      <Link href={`/recipes/${entry.id}`} aria-label={`Open ${r.name}`} className="flex h-[210px] items-center justify-center rounded-[28px] bg-surface">
        <BowlArt />
      </Link>
      <p className="text-[13px] text-ink-muted">{tags.join(" · ")}</p>
      <h2 className="text-[26px] font-semibold leading-tight tracking-tight">{r.name}</h2>
      {reason && <p className="text-[15px] leading-relaxed text-ink-muted">{reason}</p>}
      <div className="grid grid-cols-4 gap-2 border-y border-line py-3">
        {macro("kcal", r.calories, "", true)}
        {macro("Protein", r.proteinG, "g")}
        {macro("Carbs", r.carbsG, "g")}
        {macro("Fat", r.fatG, "g")}
      </div>
      <div>
        <div className="h-1 rounded-sm bg-line">
          <div className="h-1 rounded-sm bg-brand" style={{ width: `${share}%` }} />
        </div>
        <div className="mt-2 text-[13px] text-ink-muted">This meal is {share}% of your daily target</div>
      </div>
      <div className="flex gap-2.5">
        <Link
          href={`/recipes/${entry.id}`}
          className="flex h-[52px] flex-1 items-center justify-center rounded-full bg-brand font-semibold text-white hover:bg-brand-dark"
        >
          Open recipe
        </Link>
        <button
          type="button"
          onClick={onSwap}
          className="h-[52px] flex-1 rounded-full border border-ink bg-white font-semibold hover:bg-surface"
        >
          Swap it
        </button>
      </div>
    </section>
  );
}

type SwapOption = { recipeId: string; name: string; calories: number; proteinG: number | null; tags: string[]; note: string };
type OptionsResult = { options: SwapOption[]; matchedRequest: boolean | null; note: string | null };

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
      {loading && (
        <div className="flex justify-center py-7">
          <Spinner />
        </div>
      )}
      {!loading && res?.note && <p className="mb-2 text-[13px] text-ink-muted">{res.note}</p>}
      {!loading &&
        res?.options.map((o) => (
          <button
            key={o.recipeId}
            type="button"
            disabled={choosing !== null}
            onClick={() => choose(o)}
            aria-label={`Swap to ${o.name}, ${Math.round(o.calories)} calories`}
            className={cx("flex w-full items-center gap-3.5 border-t border-line py-3.5 text-left", choosing && choosing !== o.recipeId && "opacity-40")}
          >
            <span className="flex h-[52px] w-[52px] flex-none items-center justify-center overflow-hidden rounded-2xl bg-surface">
              <BowlArt size={36} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">{o.name}</span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">{o.note}</span>
            </span>
            {choosing === o.recipeId ? <Spinner /> : <strong className="text-[15px] font-semibold">{Math.round(o.calories)}</strong>}
          </button>
        ))}
      <form
        className="flex items-center gap-2.5 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) find(text.trim());
        }}
      >
        <label htmlFor="swap-ask" className="sr-only">
          Describe what you want instead
        </label>
        <input
          id="swap-ask"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or describe it, like no beans"
          className="h-[50px] min-w-0 flex-1 rounded-full border border-line px-[18px] text-[15px] outline-none focus:border-ink"
        />
        <button type="submit" disabled={loading} aria-label="Find options" className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-full bg-brand text-white disabled:opacity-50">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
function WeighInCard({ last, onSaved }: { last?: WeighIn; onSaved: (log: WeighIn, adj: Adjustment) => void }) {
  const [value, setValue] = useState(last ? String(last.weightKg) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const daysSince = last ? Math.floor((Date.now() - new Date(last.loggedAt).getTime()) / 86_400_000) : Infinity;
  const due = daysSince >= 6;
  if (!due && !message) return null;

  async function save() {
    const weightKg = Number(value);
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
      setError("Enter a weight between 30 and 300 kg.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ log: WeighIn; adjustment: Adjustment }>("/api/logs", { method: "POST", json: { weightKg } });
      setMessage(res.adjustment?.reason ?? "Weigh-in saved.");
      onSaved(res.log, res.adjustment);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (message) {
    return (
      <section aria-label="Weigh-in" className="rounded-[20px] bg-surface px-5 py-[18px]">
        <div className="text-[16px] font-semibold">Weigh-in saved</div>
        <p className="mt-1 text-[14px] text-ink-muted">{message}</p>
      </section>
    );
  }

  return (
    <section aria-label="Weigh-in" className="rounded-[20px] bg-surface px-5 py-[18px]">
      <div className="text-[16px] font-semibold">Weekly weigh-in is due</div>
      <div className="mb-3.5 mt-1 text-[14px] text-ink-muted">{last ? `Last time: ${last.weightKg} kg` : "No weigh-in yet"}</div>
      <div className="flex gap-2.5">
        <label htmlFor="wt" className="sr-only">
          Weight in kg
        </label>
        <input
          id="wt"
          value={value}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[16px] outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="h-12 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-40"
        >
          Log kg
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
