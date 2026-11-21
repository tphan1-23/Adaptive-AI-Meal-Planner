import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { Button, ErrorText, H1, H2, Muted, Page, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Adherence, Profile, WeighIn } from "@/lib/api-types";
import { addDays, isoDay, mondayOf } from "@/lib/dates";
import { c } from "@/lib/theme";

type Signals = { affinity: Record<string, number>; liked: string[] };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Progress() {
  const { width } = useWindowDimensions();
  const chartW = width - 40;
  const [data, setData] = useState<{ profile: Profile; logs: WeighIn[]; adh: Adherence; signals: Signals } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const today = new Date();
      const from = isoDay(mondayOf(today));
      const [p, l, adh, signals] = await Promise.all([
        api<{ profile: Profile | null }>("/api/profile"),
        api<{ logs: WeighIn[] }>("/api/logs"),
        api<Adherence>(`/api/adherence?from=${from}&to=${isoDay(today)}`),
        api<Signals>("/api/signals").catch(() => ({ affinity: {}, liked: [] }) as Signals),
      ]);
      if (!p.profile) throw new Error("Finish onboarding first.");
      setData({ profile: p.profile, logs: l.logs, adh, signals });
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Page>
      <View>
        <H1>Progress</H1>
        <Muted>Your trend and how closely you followed the plan.</Muted>
      </View>
      {state === "loading" && <View style={{ paddingVertical: 60 }}><Spinner /></View>}
      {state === "error" && (
        <View>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="outline" onPress={() => { setState("loading"); load(); }} style={{ marginTop: 16 }} />
        </View>
      )}
      {state === "ready" && data && <Body d={data} w={chartW} />}
    </Page>
  );
}

function Body({ d, w }: { d: { profile: Profile; logs: WeighIn[]; adh: Adherence; signals: Signals }; w: number }) {
  const weights = [...d.logs].reverse().slice(-8); // oldest to newest, last 8 weigh-ins
  const change = weights.length >= 2 ? weights[weights.length - 1].weightKg - weights[0].weightKg : null;
  const t = d.adh.totals;
  const tastes = Object.entries(d.signals.affinity)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const top = tastes[0]?.[1] ?? 1;
  const dislikes = Object.entries(d.signals.affinity)
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3);
  const worst = Math.abs(dislikes[0]?.[1] ?? 1);

  const stat = (label: string, value: string, unit: string, accent?: boolean) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.5, marginTop: 4, color: accent ? c.brand : c.ink }}>{value}</Text>
      <Text style={{ fontSize: 12, color: c.muted }}>{unit}</Text>
    </View>
  );

  return (
    <>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 16 }} accessibilityLabel="Summary">
        {stat("Daily target", d.profile.calorieTarget.toLocaleString(), "kcal", true)}
        {stat("Since first weigh-in", change === null ? "–" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`, "kg")}
        {stat("Followed", t.loggedPlannedMeals ? `${t.eatenAsPlanned}/${t.loggedPlannedMeals}` : "–", "meals")}
      </View>

      <View>
        <H2>Weight</H2>
        <Muted style={{ fontSize: 13 }}>Weigh-ins, kg</Muted>
        {weights.length < 2 ? <Muted style={{ paddingVertical: 24 }}>Log at least two weigh-ins on Today to see your trend.</Muted> : <WeightChart points={weights} w={w} />}
      </View>

      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <H2>Planned vs actual</H2>
            <Muted style={{ fontSize: 13 }}>Calories this week</Muted>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[["Plan", "#E3E3E0"], ["Eaten", c.brand]].map(([label, color]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <BarChart adh={d.adh} w={w} />
      </View>

      <View>
        <H2>Meal log</H2>
        {[
          ["Ate it", t.eatenAsPlanned, false],
          ["Changed it", t.modified, false],
          ["Skipped", t.skipped, true],
        ].map(([label, n, red], i) => (
          <View key={String(label)} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line, borderBottomWidth: i === 2 ? 1 : 0, borderBottomColor: c.line, marginTop: i === 0 ? 8 : 0 }}>
            <Text style={{ fontSize: 16 }}>{String(label)}</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: red && Number(n) > 0 ? c.brand : c.ink }}>{String(n)}</Text>
          </View>
        ))}
        <Muted style={{ fontSize: 13, marginTop: 12 }}>
          {t.followedRate != null ? `You followed your plan ${Math.round(t.followedRate * 100)}% of the time this week. ` : ""}
          Your target adjusts weekly from your weigh-ins and never goes below your safety floor.
        </Muted>
      </View>

      <View style={{ gap: 16 }}>
        <H2>What the planner learned</H2>
        <Muted style={{ fontSize: 13 }}>It learns from the meals you save, eat, rate, swap and skip. This only changes how meals are ranked for you; allergies and diet are never learned, they are rules.</Muted>
        {tastes.length === 0 && dislikes.length === 0 && <Muted>Keep, swap and skip meals and your tastes will show up here.</Muted>}
        {tastes.length > 0 && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>YOU LIKE</Text>}
        {tastes.map(([tag, v]) => (
          <View key={tag}>
            <Text style={{ fontSize: 14, marginBottom: 8 }}>{tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, " ")}</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line }}>
              <View style={{ width: `${Math.max(8, Math.round((v / top) * 100))}%`, height: 4, borderRadius: 2, backgroundColor: c.brand }} />
            </View>
          </View>
        ))}
        {dislikes.length > 0 && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>NOT YOUR THING</Text>}
        {dislikes.map(([tag, v]) => (
          <View key={tag}>
            <Text style={{ fontSize: 14, marginBottom: 8 }}>{tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, " ")}</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line }}>
              <View style={{ width: `${Math.max(8, Math.round((Math.abs(v) / worst) * 100))}%`, height: 4, borderRadius: 2, backgroundColor: "#9A9A96" }} />
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function WeightChart({ points, w }: { points: WeighIn[]; w: number }) {
  const H = 190, padX = 30, top = 28, bottom = 150;
  const vals = points.map((p) => p.weightKg);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(0.5, hi - lo); // avoid a flat-line divide by zero
  const x = (i: number) => padX + (i * (w - padX * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => bottom - ((v - lo) / span) * (bottom - top);
  const last = points.length - 1;
  const first = vals[0], end = vals[last];
  return (
    <Svg width={w} height={H} style={{ marginTop: 12 }} accessibilityLabel={`Line chart: weight went from ${first} to ${end} kilograms over ${points.length} weigh-ins`}>
      <G stroke={c.line} strokeWidth={1}>
        {[20, 62, 104, 146].map((gy) => <Line key={gy} x1={0} y1={gy} x2={w} y2={gy} />)}
      </G>
      <Polyline points={points.map((p, i) => `${x(i)},${y(p.weightKg)}`).join(" ")} fill="none" stroke={c.ink} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <G key={p.id}>
          {i === last ? <Circle cx={x(i)} cy={y(p.weightKg)} r={7.5} fill={c.brand} /> : <Circle cx={x(i)} cy={y(p.weightKg)} r={5.5} fill="#fff" stroke={c.ink} strokeWidth={2.5} />}
          <SvgText x={x(i)} y={y(p.weightKg) - 12} fontSize={12} fontWeight={i === last ? "600" : "500"} fill={i === last ? c.brand : c.ink} textAnchor="middle">{p.weightKg}</SvgText>
          <SvgText x={x(i)} y={178} fontSize={12} fill={c.muted} textAnchor="middle">{new Date(p.loggedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

function BarChart({ adh, w }: { adh: Adherence; w: number }) {
  const H = 150, barW = 16, trackTop = 8, trackH = 110;
  const monday = new Date(`${adh.from}T12:00:00`);
  const byDate = new Map(adh.days.map((d) => [d.date.slice(0, 10), d]));
  const rows = DAYS.map((label, i) => ({ label, day: byDate.get(isoDay(addDays(monday, i))) }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.day?.plannedCalories ?? 0, r.day?.actualCalories ?? 0)));
  const step = w / 7;
  const sum = rows.map((r) => `${r.label} ${r.day?.actualCalories ?? 0}`).join(", ");
  return (
    <Svg width={w} height={H} style={{ marginTop: 12 }} accessibilityLabel={`Bar chart of calories eaten against plan: ${sum}`}>
      {rows.map((r, i) => {
        const cx = step * i + step / 2;
        const planH = ((r.day?.plannedCalories ?? 0) / max) * trackH;
        const eatH = ((r.day?.actualCalories ?? 0) / max) * trackH;
        const logged = (r.day?.loggedPlannedMeals ?? 0) + (r.day?.adHoc ?? 0) > 0;
        return (
          <G key={r.label}>
            <Rect x={cx - barW - 1} y={trackTop + trackH - Math.max(planH, 4)} width={barW} height={Math.max(planH, 4)} rx={8} fill="#EDEDEB" />
            {logged && eatH > 0 ? <Rect x={cx + 1} y={trackTop + trackH - eatH} width={barW} height={eatH} rx={8} fill={c.brand} /> : <Rect x={cx + 1} y={trackTop + trackH - 4} width={barW} height={4} rx={2} fill="#C9C9C5" />}
            <SvgText x={cx} y={140} fontSize={12} fill={c.muted} textAnchor="middle">{r.label}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
