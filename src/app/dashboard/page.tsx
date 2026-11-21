"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Adherence, Profile, WeighIn } from "@/lib/api-types";
import { addDays, isoDay, mondayOf } from "@/lib/dates";
import { BottomNav, Button, ErrorText, Spinner } from "@/components/ui";

type Signals = { affinity: Record<string, number>; liked: string[] };
type Data = { profile: Profile; logs: WeighIn[]; adh: Adherence; signals: Signals };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ProgressPage() {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const today = new Date();
      const [p, l, adh, signals] = await Promise.all([
        api<{ profile: Profile | null }>("/api/profile"),
        api<{ logs: WeighIn[] }>("/api/logs"),
        api<Adherence>(`/api/adherence?from=${isoDay(mondayOf(today))}&to=${isoDay(today)}`),
        api<Signals>("/api/signals").catch(() => ({ affinity: {}, liked: [] }) as Signals),
      ]);
      if (!p.profile) {
        window.location.assign("/onboarding");
        return;
      }
      setData({ profile: p.profile, logs: l.logs, adh, signals });
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <main className="flex flex-1 flex-col gap-7 px-5 pb-6 pt-14">
        <div>
          <h1 className="mb-1.5 text-[34px] font-semibold leading-none tracking-tight">Progress</h1>
          <p className="text-[14px] text-ink-muted">Your trend and how closely you followed the plan.</p>
        </div>
        {state === "loading" && <div className="flex justify-center py-16"><Spinner /></div>}
        {state === "error" && (
          <div>
            <ErrorText>{error}</ErrorText>
            <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
          </div>
        )}
        {state === "ready" && data && <Body d={data} />}
      </main>
      <BottomNav />
    </>
  );
}

function Body({ d }: { d: Data }) {
  const weights = [...d.logs].reverse().slice(-8); // oldest to newest, last 8 weigh-ins
  const change = weights.length >= 2 ? weights[weights.length - 1].weightKg - weights[0].weightKg : null;
  const t = d.adh.totals;
  const tastes = Object.entries(d.signals.affinity).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const top = tastes[0]?.[1] ?? 1;
  const dislikes = Object.entries(d.signals.affinity).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const worst = Math.abs(dislikes[0]?.[1] ?? 1);
  const pretty = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, " ");

  const stat = (label: string, value: string, unit: string, accent?: boolean) => (
    <div className="flex-1">
      <div className="text-[12px] text-ink-muted">{label}</div>
      <div className={`mt-1 text-[24px] font-semibold tracking-tight ${accent ? "text-brand" : ""}`}>{value}</div>
      <div className="text-[12px] text-ink-muted">{unit}</div>
    </div>
  );

  return (
    <>
      <section aria-label="Summary" className="flex border-y border-line py-4">
        {stat("Daily target", d.profile.calorieTarget.toLocaleString(), "kcal", true)}
        {stat("Since first weigh-in", change === null ? "–" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`, "kg")}
        {stat("Followed", t.loggedPlannedMeals ? `${t.eatenAsPlanned}/${t.loggedPlannedMeals}` : "–", "meals")}
      </section>

      <section aria-label="Weight trend">
        <h2 className="text-[17px] font-semibold">Weight</h2>
        <p className="text-[13px] text-ink-muted">Weigh-ins, kg</p>
        {weights.length < 2 ? <p className="py-6 text-[14px] text-ink-muted">Log at least two weigh-ins on Today to see your trend.</p> : <WeightChart points={weights} />}
      </section>

      <section aria-label="Planned versus actual">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[17px] font-semibold">Planned vs actual</h2>
            <p className="text-[13px] text-ink-muted">Calories this week</p>
          </div>
          <div className="flex gap-3 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-full" style={{ background: "#E3E3E0" }} />Plan</span>
            <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-full bg-brand" />Eaten</span>
          </div>
        </div>
        <BarChart adh={d.adh} />
      </section>

      <section aria-label="Meal log">
        <h2 className="mb-2 text-[17px] font-semibold">Meal log</h2>
        {([["Ate it", t.eatenAsPlanned, false], ["Changed it", t.modified, false], ["Skipped", t.skipped, true]] as [string, number, boolean][]).map(([label, n, red], i) => (
          <div key={label} className={`flex justify-between border-t border-line py-3 ${i === 2 ? "border-b" : ""}`}>
            <span>{label}</span>
            <strong className={`font-semibold ${red && n > 0 ? "text-brand" : ""}`}>{n}</strong>
          </div>
        ))}
        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          {t.followedRate != null ? `You followed your plan ${Math.round(t.followedRate * 100)}% of the time this week. ` : ""}
          Your target adjusts weekly from your weigh-ins and never goes below your safety floor.
        </p>
      </section>

      <section aria-label="Learned tastes" className="flex flex-col gap-4">
        <h2 className="text-[17px] font-semibold">What the planner learned</h2>
        <p className="text-[13px] text-ink-muted">It learns from the meals you save, eat, rate, swap and skip. This only changes how meals are ranked for you; allergies and diet are never learned, they are rules.</p>
        {tastes.length === 0 && dislikes.length === 0 && <p className="text-[14px] text-ink-muted">Keep, swap and skip meals and your tastes will show up here.</p>}
        {tastes.length > 0 && <p className="text-[13px] font-semibold text-ink-muted">YOU LIKE</p>}
        {tastes.map(([tag, v]) => (
          <div key={tag}>
            <div className="mb-2 text-[14px]">{pretty(tag)}</div>
            <div className="h-1 rounded-sm bg-line">
              <div className="h-1 rounded-sm bg-brand" style={{ width: `${Math.max(8, Math.round((v / top) * 100))}%` }} />
            </div>
          </div>
        ))}
        {dislikes.length > 0 && <p className="text-[13px] font-semibold text-ink-muted">NOT YOUR THING</p>}
        {dislikes.map(([tag, v]) => (
          <div key={tag}>
            <div className="mb-2 text-[14px]">{pretty(tag)}</div>
            <div className="h-1 rounded-sm bg-line">
              <div className="h-1 rounded-sm" style={{ width: `${Math.max(8, Math.round((Math.abs(v) / worst) * 100))}%`, background: "#9A9A96" }} />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function WeightChart({ points }: { points: WeighIn[] }) {
  const W = 350, padX = 30, top = 28, bottom = 150;
  const vals = points.map((p) => p.weightKg);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(0.5, hi - lo); // avoid a flat-line divide by zero
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => bottom - ((v - lo) / span) * (bottom - top);
  const last = points.length - 1;
  return (
    <svg role="img" aria-label={`Line chart: weight went from ${vals[0]} to ${vals[last]} kilograms over ${points.length} weigh-ins`} viewBox={`0 0 ${W} 190`} className="mt-3 h-auto w-full">
      <g stroke="#E3E3E0" strokeWidth="1">{[20, 62, 104, 146].map((gy) => <line key={gy} x1="0" y1={gy} x2={W} y2={gy} />)}</g>
      <polyline points={points.map((p, i) => `${x(i)},${y(p.weightKg)}`).join(" ")} fill="none" stroke="#141414" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.id}>
          {i === last ? <circle cx={x(i)} cy={y(p.weightKg)} r="7.5" fill="#D92D20" /> : <circle cx={x(i)} cy={y(p.weightKg)} r="5.5" fill="#fff" stroke="#141414" strokeWidth="2.5" />}
          <text x={x(i)} y={y(p.weightKg) - 12} fontSize="12" fontWeight={i === last ? 600 : 500} fill={i === last ? "#D92D20" : "#141414"} textAnchor="middle">{p.weightKg}</text>
          <text x={x(i)} y="178" fontSize="12" fill="#6B6B6B" textAnchor="middle">{new Date(p.loggedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</text>
        </g>
      ))}
    </svg>
  );
}

function BarChart({ adh }: { adh: Adherence }) {
  const W = 350, barW = 16, trackTop = 8, trackH = 110;
  const monday = new Date(`${adh.from}T12:00:00`);
  const byDate = new Map(adh.days.map((day) => [day.date.slice(0, 10), day]));
  const rows = DAYS.map((label, i) => ({ label, day: byDate.get(isoDay(addDays(monday, i))) }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.day?.plannedCalories ?? 0, r.day?.actualCalories ?? 0)));
  const step = W / 7;
  const sum = rows.map((r) => `${r.label} ${r.day?.actualCalories ?? 0}`).join(", ");
  return (
    <svg role="img" aria-label={`Bar chart of calories eaten against plan: ${sum}`} viewBox={`0 0 ${W} 150`} className="mt-3 h-auto w-full">
      {rows.map((r, i) => {
        const cx = step * i + step / 2;
        const planH = ((r.day?.plannedCalories ?? 0) / max) * trackH;
        const eatH = ((r.day?.actualCalories ?? 0) / max) * trackH;
        const logged = (r.day?.loggedPlannedMeals ?? 0) + (r.day?.adHoc ?? 0) > 0;
        return (
          <g key={r.label}>
            <rect x={cx - barW - 1} y={trackTop + trackH - Math.max(planH, 4)} width={barW} height={Math.max(planH, 4)} rx="8" fill="#EDEDEB" />
            {logged && eatH > 0 ? <rect x={cx + 1} y={trackTop + trackH - eatH} width={barW} height={eatH} rx="8" fill="#D92D20" /> : <rect x={cx + 1} y={trackTop + trackH - 4} width={barW} height="4" rx="2" fill="#C9C9C5" />}
            <text x={cx} y="140" fontSize="12" fill="#6B6B6B" textAnchor="middle">{r.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
