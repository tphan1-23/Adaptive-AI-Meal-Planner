import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, ErrorText, H1, H2, Muted, Page, Segmented, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { parseDay } from "@/lib/dates";
import { c } from "@/lib/theme";
import { cap } from "@/lib/vocab";

type Aisle = "produce" | "meat" | "seafood" | "dairy" | "bakery" | "frozen" | "pantry" | "spices" | "other";
type UsedIn = { mealId: string; recipe: string; date: string };
type Item = { id: string; name: string; quantity: number; unit: string; checked: boolean; mealCount: number; aisle: Aisle; staple: boolean; usedIn: UsedIn[] };
type List = { planId: string; weekStart: string; items: Item[] };

const AISLES: { key: Aisle; label: string }[] = [
  { key: "produce", label: "Produce" }, { key: "meat", label: "Meat" }, { key: "seafood", label: "Seafood" },
  { key: "dairy", label: "Dairy and eggs" }, { key: "bakery", label: "Bakery" }, { key: "frozen", label: "Frozen" },
  { key: "pantry", label: "Pantry" }, { key: "spices", label: "Spices" }, { key: "other", label: "Other" },
];

// Dataset amounts are placeholders ("3 item"), so only real units are shown.
const amount = (i: Item) => (i.unit === "item" ? "" : `${+i.quantity.toFixed(2)} ${i.unit}`);
const usedText = (i: Item) => (i.usedIn.length === 0 ? "" : i.usedIn.length === 1 ? i.usedIn[0].recipe : `${i.usedIn.length} meals`);

function weekLabel(value: string) {
  const start = parseDay(value);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  const range = m(start) === m(end) ? `${m(start)} ${start.getDate()} – ${end.getDate()}` : `${m(start)} ${start.getDate()} – ${m(end)} ${end.getDate()}`;
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return now >= start && now <= end ? `this week, ${range}` : range;
}

export default function Shopping() {
  const [list, setList] = useState<List | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "noplan" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [view, setView] = useState<"aisle" | "recipe">("aisle");
  const [basicsOpen, setBasicsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<List>("/api/shopping-list"));
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState("noplan");
      else {
        setError((e as Error).message);
        setState("error");
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function toggle(item: Item) {
    const checked = !item.checked;
    const flip = (v: boolean) => setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, checked: v } : i)) } : l));
    flip(checked); // update right away, undo if the save fails
    try {
      await api("/api/shopping-list", { method: "PATCH", json: { itemId: item.id, checked } });
    } catch {
      flip(!checked);
    }
  }

  async function planWeek() {
    setPlanning(true);
    try {
      await api("/api/plan", { method: "POST", json: {} });
      await load();
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    } finally {
      setPlanning(false);
    }
  }

  const { buy, basics } = useMemo(() => {
    const items = list?.items ?? [];
    return { buy: items.filter((i) => !i.staple), basics: items.filter((i) => i.staple) };
  }, [list]);
  const left = buy.filter((i) => !i.checked).length;

  // "By recipe": each meal with the items it needs (pantry basics are listed separately).
  const meals = useMemo(() => {
    const map = new Map<string, { mealId: string; recipe: string; date: string; items: Item[] }>();
    for (const item of buy) {
      for (const u of item.usedIn) {
        const m = map.get(u.mealId) ?? { mealId: u.mealId, recipe: u.recipe, date: u.date, items: [] };
        m.items.push(item);
        map.set(u.mealId, m);
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [buy]);

  async function copy() {
    const lines: string[] = [];
    for (const a of AISLES) {
      const rows = buy.filter((i) => i.aisle === a.key && !i.checked);
      if (!rows.length) continue;
      lines.push(a.label.toUpperCase(), ...rows.map((i) => `• ${cap(i.name)}${amount(i) ? ` ${amount(i)}` : ""}`), "");
    }
    await Clipboard.setStringAsync(lines.join("\n").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const row = (i: Item, key?: string, sub?: string) => (
    <Pressable key={key ?? i.id} accessibilityRole="checkbox" accessibilityState={{ checked: i.checked }} onPress={() => toggle(i)} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line, minHeight: 56 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: i.checked ? c.brand : "#C9C9C5", backgroundColor: i.checked ? c.brand : c.white, alignItems: "center", justifyContent: "center" }}>
        {i.checked && <Text style={{ color: c.white, fontWeight: "600", fontSize: 13 }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "500", color: i.checked ? c.muted : c.ink, textDecorationLine: i.checked ? "line-through" : "none" }}>{cap(i.name)}</Text>
        {(sub ?? usedText(i)) ? <Text numberOfLines={1} style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{sub ?? usedText(i)}</Text> : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: "500" }}>{amount(i)}</Text>
    </Pressable>
  );

  return (
    <Page>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <H1>Shopping</H1>
          {state === "ready" && list && <Muted>{left} to buy{weekLabel(list.weekStart) ? ` · ${weekLabel(list.weekStart)}` : ""}</Muted>}
        </View>
        {state === "ready" && left > 0 && <Button title={copied ? "Copied ✓" : "Copy"} variant="outline" onPress={copy} style={{ minHeight: 40, paddingHorizontal: 18 }} />}
      </View>

      {state === "loading" && <View style={{ paddingVertical: 60 }}><Spinner /></View>}
      {state === "error" && (
        <View>
          <ErrorText>{error ?? "Couldn't load your list."}</ErrorText>
          <Button title="Try again" variant="outline" onPress={() => { setState("loading"); load(); }} style={{ marginTop: 16 }} />
        </View>
      )}
      {state === "noplan" && (
        <View style={{ paddingVertical: 48, gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", textAlign: "center" }}>No plan yet</Text>
          <Muted style={{ textAlign: "center", marginBottom: 12 }}>Your list fills in from this week's meals.</Muted>
          <Button title="Plan my week" onPress={planWeek} loading={planning} />
        </View>
      )}
      {state === "ready" && list && list.items.length === 0 && <Muted style={{ textAlign: "center", paddingVertical: 48 }}>Nothing to buy for this week.</Muted>}

      {state === "ready" && list && list.items.length > 0 && (
        <>
          <Segmented<"aisle" | "recipe"> height={44} options={[{ value: "aisle", label: "By aisle" }, { value: "recipe", label: "By recipe" }]} value={view} onChange={setView} />

          {view === "aisle" &&
            AISLES.map((a) => {
              const rows = buy.filter((i) => i.aisle === a.key);
              if (!rows.length) return null;
              const remaining = rows.filter((i) => !i.checked).length;
              return (
                <View key={a.key}>
                  <H2>{a.label} <Text style={{ color: c.muted, fontWeight: "400", fontSize: 14 }}>· {remaining}</Text></H2>
                  {[...rows.filter((i) => !i.checked), ...rows.filter((i) => i.checked)].map((i) => row(i))}
                </View>
              );
            })}

          {view === "recipe" &&
            meals.map((m) => (
              <View key={m.mealId}>
                <H2>{m.date ? `${parseDay(m.date).toLocaleDateString(undefined, { weekday: "long" })}: ` : ""}{m.recipe}</H2>
                {m.items.map((i) => row(i, `${m.mealId}-${i.id}`, i.usedIn.length > 1 ? `also in ${i.usedIn.length - 1} other meal${i.usedIn.length > 2 ? "s" : ""}` : ""))}
              </View>
            ))}

          {basics.length > 0 && (
            <View>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: basicsOpen }} onPress={() => setBasicsOpen(!basicsOpen)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, borderTopWidth: 1, borderTopColor: c.line }}>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: "600" }}>Pantry basics</Text>
                  <Muted style={{ fontSize: 13 }}>You probably have these: {basics.map((b) => cap(b.name)).join(", ")}</Muted>
                </View>
                <Text style={{ color: c.brand, fontWeight: "600" }}>{basicsOpen ? "Hide" : "Check"}</Text>
              </Pressable>
              {basicsOpen && basics.map((i) => row(i))}
            </View>
          )}

          <Muted style={{ fontSize: 12, lineHeight: 19 }}>Matching ingredients are merged in code (for example "garlic clove" and "garlic"). Quantities are not estimated by the AI.</Muted>
        </>
      )}
    </Page>
  );
}
