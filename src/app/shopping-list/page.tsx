"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { BottomNav, Button, Spinner, cx } from "@/components/ui";

type Item = { id: string; name: string; quantity: number; unit: string; checked: boolean; mealCount: number };
type List = { planId: string; weekStart: string; items: Item[] };

// Dataset amounts are placeholders ("3 item"), so only show a count when it's more than 1.
const amount = (i: Item) =>
  i.unit === "item" ? (i.quantity > 1 ? `×${i.quantity}` : "") : `${+i.quantity.toFixed(2)} ${i.unit}`;

// The API sends weekStart as "2026-11-16" or "2026-11-16T00:00:00.000Z"; use only the date part.
// Shows "this week, Nov 16 – 22", or "Nov 30 – Dec 6" across months. Noon avoids time-zone day shifts.
const weekLabel = (value: string) => {
  const start = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  const range =
    month(start) === month(end)
      ? `${month(start)} ${start.getDate()} – ${end.getDate()}`
      : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return today >= start && today <= end ? `this week, ${range}` : range;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ShoppingListPage() {
  const [list, setList] = useState<List | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "noplan" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [planning, setPlanning] = useState(false);

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
    const flip = (c: boolean) =>
      setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, checked: c } : i)) } : l));
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
    const text = toBuy.map((i) => `• ${cap(i.name)}${amount(i) ? ` ${amount(i)}` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Your browser blocked the clipboard.");
    }
  }

  return (
    <>
      <main className="flex-1 px-5 pb-8 pt-8">
        <header className="mb-2 flex items-start">
          <div className="flex-1">
            <h1 className="text-[28px] font-bold leading-tight">Shopping</h1>
            {state === "ready" && list ? (
              <p className="text-[13px] text-ink-muted">
                {toBuy.length} to buy{weekLabel(list.weekStart) ? ` · ${weekLabel(list.weekStart)}` : ""}
              </p>
            ) : null}
          </div>
          {state === "ready" && toBuy.length > 0 ? (
            <button
              type="button"
              onClick={copy}
              className="mt-1 rounded-full border-[1.5px] border-ink px-4 py-1.5 text-[13px] font-semibold hover:bg-surface"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          ) : null}
        </header>

        {state === "loading" && (
          <div className="flex justify-center py-20"><Spinner /></div>
        )}

        {state === "error" && (
          <div className="py-16 text-center">
            <p className="text-[15px] text-ink-muted">{error ?? "Couldn't load your list."}</p>
            <button type="button" onClick={load} className="mt-3 font-semibold text-brand">Try again</button>
          </div>
        )}

        {state === "noplan" && (
          <div className="py-16 text-center">
            <p className="mb-1 text-[17px] font-semibold">No plan yet</p>
            <p className="mb-6 text-[14px] text-ink-muted">Your list fills in from this week’s meals.</p>
            <Button loading={planning} onClick={planWeek}>Plan my week</Button>
          </div>
        )}

        {state === "ready" && list && list.items.length === 0 && (
          <p className="py-16 text-center text-[15px] text-ink-muted">Nothing to buy for this week.</p>
        )}

        {state === "ready" && got.length > 0 && <Group title="Got it" items={got} onToggle={toggle} />}
        {state === "ready" && toBuy.length > 0 && <Group title="To buy" items={toBuy} onToggle={toggle} />}
      </main>
      <BottomNav />
    </>
  );
}

function Group({ title, items, onToggle }: { title: string; items: Item[]; onToggle: (i: Item) => void }) {
  return (
    <section className="mt-5">
      <h2 className="mb-1 text-[15px] font-bold">{title}</h2>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={i.checked}
              onClick={() => onToggle(i)}
              className="flex w-full items-center gap-3 border-b border-line py-3 text-left"
            >
              <span
                className={cx(
                  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[12px] font-bold text-white",
                  i.checked ? "border-brand bg-brand" : "border-line",
                )}
              >
                {i.checked ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-[15px]", i.checked && "text-ink-muted line-through")}>{cap(i.name)}</span>
                <span className="block text-[12px] text-ink-muted">
                  Used in {i.mealCount} {i.mealCount === 1 ? "meal" : "meals"}
                </span>
              </span>
              <span className={cx("text-[13px]", i.checked && "text-ink-muted line-through")}>{amount(i)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
