"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { MealLog } from "@/lib/api-types";
import { MEAL_TYPES, cap, type MealTypeName } from "@/lib/vocab";
import Sheet from "./Sheet";
import { Button, Chip, ErrorText, Label } from "./ui";

const field = "h-[50px] w-full rounded-full border border-line px-[18px] text-[16px] outline-none focus:border-ink";

/** Log a planned meal: ate it as planned, changed it (with calories), or skipped it. After eating, asks "How was it?". */
export function LogMealSheet({ entryId, recipeId, planned, existing, onClose, onSaved }: { entryId: string; recipeId?: string; planned: number; existing: MealLog | null; onClose: () => void; onSaved: (l: MealLog | null) => void }) {
  const [changing, setChanging] = useState(false);
  const [kcal, setKcal] = useState(String(planned));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<MealLog | null>(null); // set after eating: the "How was it?" step

  async function save(status: "eaten_as_planned" | "skipped" | "modified") {
    const calories = Number(kcal);
    if (status === "modified" && !(Number.isFinite(calories) && calories >= 0 && calories <= 5000)) return setError("Enter calories between 0 and 5000.");
    setBusy(status);
    setError(null);
    try {
      const res = await api<{ log: MealLog }>("/api/meal-logs", { method: "POST", json: { entryId, status, ...(status === "modified" ? { calories } : {}) } });
      if (status !== "skipped" && recipeId) setSaved(res.log);
      else onSaved(res.log);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function rate(value: 5 | 1 | null) {
    if (!saved) return;
    if (value !== null && recipeId) await api("/api/signals", { method: "POST", json: { recipeId, type: "rating", value } }).catch(() => {}); // a failed rating must not block logging
    onSaved(saved);
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

  if (saved) {
    return (
      <Sheet title="How was it?" onClose={() => rate(null)}>
        <p className="mb-3.5 text-[14px] text-ink-muted">Your answer helps the planner pick meals you&apos;ll like.</p>
        <div className="flex flex-col gap-2.5">
          <Button onClick={() => rate(5)}>Loved it</Button>
          <Button variant="outline" onClick={() => rate(null)}>It was fine</Button>
          <Button variant="outline" onClick={() => rate(1)}>Not for me</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Log this meal" onClose={onClose}>
      <p className="mb-3.5 text-[14px] text-ink-muted">This feeds your Progress charts. You can change it later.</p>
      <div className="flex flex-col gap-2.5">
        <Button loading={busy === "eaten_as_planned"} onClick={() => save("eaten_as_planned")}>I ate it as planned</Button>
        {changing ? (
          <>
            <Label htmlFor="kcal">Calories you actually ate</Label>
            <input id="kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={field} />
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

/** Log something eaten that was not in the plan: what it was, roughly how many calories, and which meal. */
export function FoodSheet({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: (l: MealLog) => void }) {
  const hour = new Date().getHours();
  const [mealType, setMealType] = useState<MealTypeName>(hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snack");
  const [what, setWhat] = useState("");
  const [kcal, setKcal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const calories = Number(kcal);
    if (!kcal.trim() || !Number.isFinite(calories) || calories < 0 || calories > 5000) return setError("Enter calories between 0 and 5000.");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ log: MealLog }>("/api/meal-logs", {
        method: "POST",
        json: { status: "ad_hoc", calories: Math.round(calories), mealType, date, ...(what.trim() ? { note: what.trim().slice(0, 300) } : {}) },
      });
      onSaved(res.log);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Log other food" onClose={onClose}>
      <p className="mb-3.5 text-[14px] text-ink-muted">Anything you ate that wasn&apos;t in your plan. It counts toward today&apos;s calories.</p>
      <Label>Which meal</Label>
      <div className="mb-3.5 flex flex-wrap gap-2">
        {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={mealType === m} onClick={() => setMealType(m)} />)}
      </div>
      <Label htmlFor="what">What did you eat? (optional)</Label>
      <input id="what" value={what} maxLength={300} onChange={(e) => setWhat(e.target.value)} placeholder="Greek yogurt with honey" className={`${field} mb-3.5`} />
      <Label htmlFor="cal">Calories</Label>
      <input id="cal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && save()} placeholder="250" className={`${field} mb-4`} />
      <Button loading={busy} onClick={save}>Add to today</Button>
      <p className="mt-2.5 text-[12px] text-ink-muted">Not sure? A rough number is fine.</p>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}

/** Log a recipe picked while browsing as something eaten (today or yesterday), then ask how it was. */
export function EatRecipeSheet({ recipeId, name, calories, onClose, onSaved }: { recipeId: string; name: string; calories: number; onClose: () => void; onSaved: () => void }) {
  const hour = new Date().getHours();
  const [mealType, setMealType] = useState<MealTypeName>(hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snack");
  const [when, setWhen] = useState<"today" | "yesterday">("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false); // after saving: the "How was it?" step

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const d = new Date();
      if (when === "yesterday") d.setDate(d.getDate() - 1);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await api("/api/meal-logs", { method: "POST", json: { status: "ad_hoc", recipeId, mealType, date } });
      setLogged(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rate(value: 5 | 1 | null) {
    if (value !== null) await api("/api/signals", { method: "POST", json: { recipeId, type: "rating", value } }).catch(() => {}); // a failed rating must not block logging
    onSaved();
  }

  if (logged) {
    return (
      <Sheet title="How was it?" onClose={() => rate(null)}>
        <p className="mb-3.5 text-[14px] leading-relaxed text-ink-muted">Logged. Your answer helps the planner pick meals you&apos;ll like.</p>
        <div className="flex flex-col gap-2.5">
          <Button onClick={() => rate(5)}>Loved it</Button>
          <Button variant="outline" onClick={() => rate(null)}>It was fine</Button>
          <Button variant="outline" onClick={() => rate(1)}>Not for me</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Log as eaten" onClose={onClose}>
      <p className="mb-3.5 text-[14px] leading-relaxed text-ink-muted">{name} · {Math.round(calories)} kcal. It counts toward that day&apos;s calories and doesn&apos;t change your plan.</p>
      <Label>Which day</Label>
      <div className="mb-3.5 flex gap-2">
        <Chip label="Today" selected={when === "today"} onClick={() => setWhen("today")} />
        <Chip label="Yesterday" selected={when === "yesterday"} onClick={() => setWhen("yesterday")} />
      </div>
      <Label>Which meal</Label>
      <div className="mb-4 flex flex-wrap gap-2">
        {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={mealType === m} onClick={() => setMealType(m)} />)}
      </div>
      <Button loading={busy} onClick={save}>Log it</Button>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
