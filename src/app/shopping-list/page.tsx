"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { parseDay } from "@/lib/dates";
import { cap } from "@/lib/vocab";
import { BottomNav, Button, Segmented, Spinner, cx } from "@/components/ui";

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

// The API sends weekStart as "2026-11-16" or "2026-11-16T00:00:00.000Z"; use only the date part.
const weekLabel = (value: string) => {
  const start = parseDay(value);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  const range = month(start) === month(end) ? `${month(start)} ${start.getDate()} – ${end.getDate()}` : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return today >= start && today <= end ? `this week, ${range}` : range;
};

export default function ShoppingListPage() {
  const [list, setList] = useState<List | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "noplan" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [view, setView] = useState<"aisle" | "recipe">("aisle");
  const [basicsOpen, setBasicsOpen] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
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

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(item: Item) {
    const checked = !item.checked;
    const flip = (c: boolean) => setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, checked: c } : i)) } : l));
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
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Your browser blocked the clipboard.");
    }
  }

  const row = (i: Item, key?: string, sub?: string) => (
    <li key={key ?? i.id}>
      <button type="button" role="checkbox" aria-checked={i.checked} onClick={() => toggle(i)} className="flex w-full items-center gap-3 border-b border-line py-3 text-left">
        <span className={cx("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[12px] font-bold text-white", i.checked ? "border-brand bg-brand" : "border-line")}>{i.checked ? "✓" : ""}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[15px]", i.checked && "text-ink-muted line-through")}>{cap(i.name)}</span>
          {(sub ?? usedText(i)) && <span className="block truncate text-[12px] text-ink-muted">{sub ?? usedText(i)}</span>}
        </span>
        <span className={cx("text-[13px]", i.checked && "text-ink-muted line-through")}>{amount(i)}</span>
      </button>
    </li>
  );

  return (
    <>
      <main className="flex-1 px-5 pb-8 pt-8">
        <header className="mb-3 flex items-start">
          <div className="flex-1">
            <h1 className="text-[28px] font-bold leading-tight">Shopping</h1>
            {state === "ready" && list ? <p className="text-[13px] text-ink-muted">{left} to buy{weekLabel(list.weekStart) ? ` · ${weekLabel(list.weekStart)}` : ""}</p> : null}
          </div>
          {state === "ready" && left > 0 ? (
            <button type="button" onClick={copy} className="mt-1 rounded-full border-[1.5px] border-ink px-4 py-1.5 text-[13px] font-semibold hover:bg-surface">{copied ? "Copied ✓" : "Copy"}</button>
          ) : null}
        </header>

        {state === "loading" && <div className="flex justify-center py-20"><Spinner /></div>}
        {state === "error" && (
          <div className="py-16 text-center">
            <p className="text-[15px] text-ink-muted">{error ?? "Couldn't load your list."}</p>
            <button type="button" onClick={load} className="mt-3 font-semibold text-brand">Try again</button>
          </div>
        )}
        {state === "noplan" && (
          <div className="py-16 text-center">
            <p className="mb-1 text-[17px] font-semibold">No plan yet</p>
            <p className="mb-6 text-[14px] text-ink-muted">Your list fills in from this week&apos;s meals.</p>
            <Button loading={planning} onClick={planWeek}>Plan my week</Button>
          </div>
        )}
        {state === "ready" && list && list.items.length === 0 && <p className="py-16 text-center text-[15px] text-ink-muted">Nothing to buy for this week.</p>}

        {state === "ready" && list && list.items.length > 0 && (
          <>
            <Segmented<"aisle" | "recipe"> options={[{ value: "aisle", label: "By aisle" }, { value: "recipe", label: "By recipe" }]} value={view} onChange={setView} />

            {view === "aisle" &&
              AISLES.map((a) => {
                const rows = buy.filter((i) => i.aisle === a.key);
                if (!rows.length) return null;
                return (
                  <section key={a.key} className="mt-5">
                    <h2 className="mb-1 text-[15px] font-bold">{a.label} <span className="font-normal text-ink-muted">· {rows.filter((i) => !i.checked).length}</span></h2>
                    <ul>{[...rows.filter((i) => !i.checked), ...rows.filter((i) => i.checked)].map((i) => row(i))}</ul>
                  </section>
                );
              })}

            {view === "recipe" &&
              meals.map((m) => (
                <section key={m.mealId} className="mt-5">
                  <h2 className="mb-1 text-[15px] font-bold">{m.date ? `${parseDay(m.date).toLocaleDateString(undefined, { weekday: "long" })}: ` : ""}{m.recipe}</h2>
                  <ul>{m.items.map((i) => row(i, `${m.mealId}-${i.id}`, i.usedIn.length > 1 ? `also in ${i.usedIn.length - 1} other meal${i.usedIn.length > 2 ? "s" : ""}` : ""))}</ul>
                </section>
              ))}

            {basics.length > 0 && (
              <section className="mt-5 border-t border-line">
                <button type="button" aria-expanded={basicsOpen} onClick={() => setBasicsOpen(!basicsOpen)} className="flex min-h-[48px] w-full items-center justify-between py-2 text-left">
                  <span>
                    <span className="block text-[15px] font-bold">Pantry basics</span>
                    <span className="block text-[13px] text-ink-muted">You probably have these: {basics.map((b) => cap(b.name)).join(", ")}</span>
                  </span>
                  <span className="font-semibold text-brand">{basicsOpen ? "Hide" : "Check"}</span>
                </button>
                {basicsOpen && <ul>{basics.map((i) => row(i))}</ul>}
              </section>
            )}

            <p className="mt-5 text-[12px] leading-relaxed text-ink-muted">Matching ingredients are merged in code (for example &quot;garlic clove&quot; and &quot;garlic&quot;). Quantities are not estimated by the AI.</p>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
