import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, ErrorText, H1, H2, Muted, Page, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { parseDay } from "@/lib/dates";
import { c } from "@/lib/theme";

type Item = { id: string; name: string; quantity: number; unit: string; checked: boolean; mealCount: number };
type List = { planId: string; weekStart: string; items: Item[] };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Dataset amounts are placeholders ("3 item"), so only show a count when it's more than 1.
const amount = (i: Item) => (i.unit === "item" ? (i.quantity > 1 ? `×${i.quantity}` : "") : `${+i.quantity.toFixed(2)} ${i.unit}`);

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

  const toBuy = list?.items.filter((i) => !i.checked) ?? [];
  const got = list?.items.filter((i) => i.checked) ?? [];

  async function copy() {
    await Clipboard.setStringAsync(toBuy.map((i) => `• ${cap(i.name)}${amount(i) ? ` ${amount(i)}` : ""}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const row = (i: Item) => (
    <Pressable key={i.id} accessibilityRole="checkbox" accessibilityState={{ checked: i.checked }} onPress={() => toggle(i)} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.line, minHeight: 56 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: i.checked ? c.brand : "#C9C9C5", backgroundColor: i.checked ? c.brand : c.white, alignItems: "center", justifyContent: "center" }}>
        {i.checked && <Text style={{ color: c.white, fontWeight: "600", fontSize: 13 }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "500", color: i.checked ? c.muted : c.ink, textDecorationLine: i.checked ? "line-through" : "none" }}>{cap(i.name)}</Text>
        <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Used in {i.mealCount} {i.mealCount === 1 ? "meal" : "meals"}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "500" }}>{amount(i)}</Text>
    </Pressable>
  );

  return (
    <Page>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <H1>Shopping</H1>
          {state === "ready" && list && <Muted>{toBuy.length} to buy{weekLabel(list.weekStart) ? ` · ${weekLabel(list.weekStart)}` : ""}</Muted>}
        </View>
        {state === "ready" && toBuy.length > 0 && <Button title={copied ? "Copied ✓" : "Copy"} variant="outline" onPress={copy} style={{ minHeight: 40, paddingHorizontal: 18 }} />}
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
          {toBuy.length > 0 && <View><H2>To buy</H2>{toBuy.map(row)}</View>}
          {got.length > 0 && <View><H2>Got it</H2>{got.map(row)}</View>}
          <Muted style={{ fontSize: 12, lineHeight: 19 }}>Matching ingredients are merged. Quantities are added up in code, not estimated by the AI.</Muted>
        </>
      )}
    </Page>
  );
}
