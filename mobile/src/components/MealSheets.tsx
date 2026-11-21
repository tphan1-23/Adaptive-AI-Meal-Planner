import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import type { MealLog } from "@/lib/api-types";
import { c } from "@/lib/theme";
import { MEAL_TYPES, cap, type MealTypeName } from "@/lib/vocab";
import { Button, Chip, ErrorText, Label, Muted, Sheet } from "./ui";

const box = { height: 50, borderWidth: 1, borderColor: c.line, borderRadius: 25, paddingHorizontal: 18, fontSize: 16, color: c.ink } as const;

/** Log a planned meal: ate it as planned, changed it (with calories), or skipped it. Can also remove an earlier log. */
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
      // After eating something, ask how it was, so the planner learns what you like. Skips need no question.
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

  if (saved) {
    return (
      <Sheet title="How was it?" onClose={() => rate(null)}>
        <Muted style={{ marginBottom: 14 }}>Your answer helps the planner pick meals you'll like.</Muted>
        <View style={{ gap: 10 }}>
          <Button title="Loved it" onPress={() => rate(5)} />
          <Button title="It was fine" variant="outline" onPress={() => rate(null)} />
          <Button title="Not for me" variant="outline" onPress={() => rate(1)} />
        </View>
      </Sheet>
    );
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

  return (
    <Sheet title="Log this meal" onClose={onClose}>
      <Muted style={{ marginBottom: 14 }}>This feeds your Progress charts. You can change it later.</Muted>
      <View style={{ gap: 10 }}>
        <Button title="I ate it as planned" onPress={() => save("eaten_as_planned")} loading={busy === "eaten_as_planned"} />
        {changing ? (
          <View style={{ gap: 10 }}>
            <Label>Calories you actually ate</Label>
            <TextInput accessibilityLabel="Calories you ate" value={kcal} onChangeText={setKcal} keyboardType="number-pad" style={box} />
            <Button title="Save what I ate" variant="dark" onPress={() => save("modified")} loading={busy === "modified"} />
          </View>
        ) : (
          <Button title="I changed it" variant="outline" onPress={() => setChanging(true)} />
        )}
        <Button title="I skipped it" variant="outline" onPress={() => save("skipped")} loading={busy === "skipped"} />
        {existing && <Button title="Remove my log" variant="outline" onPress={undo} loading={busy === "undo"} />}
      </View>
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
      <Muted style={{ marginBottom: 14 }}>Anything you ate that wasn't in your plan. It counts toward today's calories.</Muted>
      <Label>Which meal</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={mealType === m} onPress={() => setMealType(m)} />)}
      </View>
      <Label>What did you eat? (optional)</Label>
      <TextInput accessibilityLabel="What you ate" value={what} onChangeText={setWhat} maxLength={300} placeholder="Greek yogurt with honey" placeholderTextColor="#9A9A96" style={[box, { marginBottom: 14 }]} />
      <Label>Calories</Label>
      <TextInput accessibilityLabel="Calories" value={kcal} onChangeText={setKcal} keyboardType="number-pad" placeholder="250" placeholderTextColor="#9A9A96" style={[box, { marginBottom: 16 }]} onSubmitEditing={save} />
      <Button title="Add to today" onPress={save} loading={busy} />
      <Text style={{ color: c.muted, fontSize: 12, marginTop: 10 }}>Not sure? A rough number is fine.</Text>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
