import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import BowlArt from "@/components/BowlArt";
import { Button, ErrorText, H1, Muted, Page, Sheet, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Entry, Plan, Profile, WeighIn } from "@/lib/api-types";
import { addDays, dayKey, isoDay, parseDay } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { c } from "@/lib/theme";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SwapResult = { entry: Entry; reason: string; matchedRequest: boolean | null };
type Adjustment = { changed: boolean; newTarget: number; reason: string } | null;

export default function Today() {
  const todayKey = isoDay(new Date());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [selected, setSelected] = useState(todayKey);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [swapFor, setSwapFor] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    setState((s) => (s === "ready" ? s : "loading")); // keep showing the old data while refreshing
    try {
      const [p, logs] = await Promise.all([api<{ profile: Profile | null }>("/api/profile"), api<{ logs: WeighIn[] }>("/api/logs")]);
      if (!p.profile) return router.replace("/onboarding");
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
      if (e instanceof ApiError && e.status === 409) return router.replace("/onboarding");
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  // Reload whenever the screen is shown, so changes made on the recipe screen appear.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const days = useMemo(() => {
    if (!plan) return [];
    const start = parseDay(plan.weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [plan]);

  const selectedKey = days.length && !days.some((d) => isoDay(d) === selected) ? isoDay(days[0]) : selected;
  const entries = (plan?.entries ?? []).filter((e) => dayKey(e.date) === selectedKey).sort((a, b) => a.position - b.position);
  const selectedDate = parseDay(selectedKey);

  function applySwap(res: SwapResult) {
    setPlan((p) => (p ? { ...p, entries: p.entries.map((e) => (e.id === res.entry.id ? res.entry : e)) } : p));
    setReasons((r) => ({ ...r, [res.entry.id]: res.reason }));
  }

  return (
    <>
      <Page>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Muted>{selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Muted>
            <H1>{selectedKey === todayKey ? "Today" : selectedDate.toLocaleDateString(undefined, { weekday: "long" })}</H1>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => supabase.auth.signOut()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontWeight: "600", fontSize: 12, color: c.ink }}>Sign out</Text>
          </Pressable>
        </View>

        {state === "loading" && <View style={{ paddingVertical: 60 }}><Spinner /></View>}

        {state === "error" && (
          <View>
            <ErrorText>{error}</ErrorText>
            <Button title="Try again" variant="outline" onPress={load} style={{ marginTop: 16 }} />
          </View>
        )}

        {state === "ready" && plan && profile && (
          <>
            <View style={{ flexDirection: "row" }} accessibilityLabel="This week">
              {days.map((d) => {
                const key = isoDay(d);
                const on = key === selectedKey;
                return (
                  <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSelected(key)} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 12, color: on ? c.ink : c.muted, fontWeight: on ? "500" : "400" }}>{DAY[d.getDay()]}</Text>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: on ? c.brand : c.white,
                        borderWidth: !on && key === todayKey ? 1 : 0,
                        borderColor: c.brand,
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "500", color: on ? c.white : c.ink }}>{d.getDate()}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {entries.length === 0 && <Muted style={{ textAlign: "center", paddingVertical: 32 }}>Nothing planned for this day.</Muted>}
            {entries.map((e) => (
              <MealCard key={e.id} entry={e} profile={profile} target={plan.calorieTarget} reason={reasons[e.id]} onSwap={() => setSwapFor(e)} />
            ))}

            <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Muted>Daily target</Muted>
              <Text style={{ fontSize: 20, fontWeight: "600" }}>{profile.calorieTarget.toLocaleString()} kcal</Text>
            </View>

            <WeighInCard
              last={weighIns[0]}
              onSaved={(log, adj) => {
                setWeighIns((w) => [log, ...w]);
                if (adj?.changed) setProfile((p) => (p ? { ...p, calorieTarget: adj.newTarget } : p));
              }}
            />
          </>
        )}
      </Page>

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
    </>
  );
}

function MealCard({ entry, profile, target, reason, onSwap }: { entry: Entry; profile: Profile; target: number; reason?: string; onSwap: () => void }) {
  const r = entry.recipe;
  const tags = [profile.diet ? cap(profile.diet) : null, ...profile.allergies.map((a) => `${cap(a)} free`), cap(entry.mealType)].filter(Boolean);
  const share = Math.min(100, Math.round((r.calories / Math.max(1, target)) * 100));
  const macro = (label: string, value: number | null, unit: string, accent?: boolean) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ fontSize: 19, fontWeight: "600", color: accent ? c.brand : c.ink }}>
        {value === null ? "–" : Math.round(value)}
        {unit}
      </Text>
    </View>
  );

  return (
    <View style={{ gap: 14 }} accessibilityLabel="Recommended recipe">
      <Link href={`/recipes/${entry.id}`} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open ${r.name}`} style={{ height: 210, borderRadius: 28, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
          <BowlArt />
        </Pressable>
      </Link>
      <Muted style={{ fontSize: 13 }}>{tags.join(" · ")}</Muted>
      <Text accessibilityRole="header" style={{ fontSize: 26, lineHeight: 30, fontWeight: "600", letterSpacing: -0.5 }}>
        {r.name}
      </Text>
      {reason ? <Muted style={{ fontSize: 15, lineHeight: 23 }}>{reason}</Muted> : null}
      <View style={{ flexDirection: "row", gap: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 12 }}>
        {macro("kcal", r.calories, "", true)}
        {macro("Protein", r.proteinG, "g")}
        {macro("Carbs", r.carbsG, "g")}
        {macro("Fat", r.fatG, "g")}
      </View>
      <View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line }}>
          <View style={{ width: `${share}%`, height: 4, borderRadius: 2, backgroundColor: c.brand }} />
        </View>
        <Muted style={{ fontSize: 13, marginTop: 8 }}>This meal is {share}% of your daily target</Muted>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button title="Open recipe" onPress={() => router.push(`/recipes/${entry.id}`)} style={{ flex: 1 }} />
        <Button title="Swap it" variant="outline" onPress={onSwap} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

type SwapOption = { recipeId: string; name: string; calories: number; proteinG: number | null; tags: string[]; note: string };
type OptionsResult = { options: SwapOption[]; matchedRequest: boolean | null; note: string | null };

function SwapSheet({ entry, onClose, onSwapped }: { entry: Entry; onClose: () => void; onSwapped: (r: SwapResult) => void }) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string>(""); // the request the shown options are for
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
      <Muted style={{ marginBottom: 14 }}>Close matches from your safe recipes, ranked by calories and your tastes.</Muted>

      {loading && <View style={{ paddingVertical: 28 }}><Spinner /></View>}
      {!loading && res?.note ? <Muted style={{ marginBottom: 8, fontSize: 13 }}>{res.note}</Muted> : null}
      {!loading &&
        res?.options.map((o) => (
          <Pressable
            key={o.recipeId}
            accessibilityRole="button"
            accessibilityLabel={`Swap to ${o.name}, ${Math.round(o.calories)} calories`}
            disabled={choosing !== null}
            onPress={() => choose(o)}
            style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.line, opacity: choosing && choosing !== o.recipeId ? 0.4 : 1 }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <BowlArt size={36} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: "500" }}>{o.name}</Text>
              <Text style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{o.note}</Text>
            </View>
            {choosing === o.recipeId ? <Spinner /> : <Text style={{ fontSize: 15, fontWeight: "600" }}>{Math.round(o.calories)}</Text>}
          </Pressable>
        ))}

      <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16, flexDirection: "row", gap: 10, alignItems: "center" }}>
        <TextInput
          accessibilityLabel="Describe what you want instead"
          value={text}
          onChangeText={setText}
          maxLength={200}
          placeholder="Or describe it, like no beans"
          placeholderTextColor="#9A9A96"
          onSubmitEditing={() => !loading && find(text.trim())}
          returnKeyType="search"
          style={{ flex: 1, height: 50, borderWidth: 1, borderColor: c.line, borderRadius: 25, paddingHorizontal: 18, fontSize: 15 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Find options" disabled={loading} onPress={() => find(text.trim())} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.brand, alignItems: "center", justifyContent: "center", opacity: loading ? 0.5 : 1 }}>
          <Text style={{ color: c.white, fontSize: 20, fontWeight: "600" }}>↑</Text>
        </Pressable>
      </View>
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
  if (daysSince < 6 && !message) return null;

  async function save() {
    const weightKg = Number(value.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) return setError("Enter a weight between 30 and 300 kg.");
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

  return (
    <View accessibilityLabel="Weigh-in" style={{ backgroundColor: c.surface, borderRadius: 20, padding: 18 }}>
      {message ? (
        <>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>Weigh-in saved</Text>
          <Muted style={{ marginTop: 4 }}>{message}</Muted>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>Weekly weigh-in is due</Text>
          <Muted style={{ marginTop: 4, marginBottom: 14 }}>{last ? `Last time: ${last.weightKg} kg` : "No weigh-in yet"}</Muted>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              accessibilityLabel="Weight in kg"
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              style={{ flex: 1, height: 48, borderWidth: 1, borderColor: c.line, borderRadius: 24, paddingHorizontal: 16, fontSize: 16, backgroundColor: c.white }}
            />
            <Button title="Log kg" variant="dark" onPress={save} loading={busy} style={{ minHeight: 48, borderRadius: 24 }} />
          </View>
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </View>
  );
}
