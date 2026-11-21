import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import BowlArt from "@/components/BowlArt";
import { EatRecipeSheet } from "@/components/MealSheets";
import { Button, Chip, ErrorText, Muted, Page, Sheet, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { c } from "@/lib/theme";
import { MEAL_TYPES, cap, type MealTypeName } from "@/lib/vocab";

type Recipe = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
  tags: string[];
  imageUrl: string | null;
  isFavorite: boolean;
};

const qty = (i: Recipe["ingredients"][number]) => (i.unit === "item" ? "" : `${+i.quantity.toFixed(2)} ${i.unit}`);

/** A saved recipe on its own (not tied to a day in the plan): photo, nutrition, ingredients and method. */
export default function SavedRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [tab, setTab] = useState<"ingr" | "method">("ingr");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [eating, setEating] = useState(false);
  const [logged, setLogged] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { recipe } = await api<{ recipe: Recipe }>(`/api/recipes/${id}`);
      setRecipe(recipe);
      setFavorite(recipe.isFavorite);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "We couldn't find that recipe." : (e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFavorite() {
    if (!recipe) return;
    const next = !favorite;
    setFavorite(next);
    try {
      await api("/api/favorites", { method: next ? "POST" : "DELETE", json: { recipeId: recipe.id } });
    } catch {
      setFavorite(!next);
    }
  }

  const stat = (label: string, v: number | null, unit = "g", accent?: boolean) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: c.muted }}>{label}</Text>
      <Text style={{ fontSize: 19, fontWeight: "600", color: accent ? c.brand : c.ink }}>{v === null ? "–" : `${Math.round(v)}${unit}`}</Text>
    </View>
  );

  return (
    <Page>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: -10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/saved"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5 8 12l7 7" /></Svg>
        </Pressable>
        {recipe && (
          <Pressable accessibilityRole="button" accessibilityLabel={favorite ? "Remove from saved recipes" : "Save recipe"} onPress={toggleFavorite} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill={favorite ? c.brand : "none"} stroke={favorite ? c.brand : c.ink} strokeWidth={2} strokeLinejoin="round"><Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" /></Svg>
          </Pressable>
        )}
      </View>

      {!recipe && !error && <View style={{ paddingVertical: 60 }}><Spinner /></View>}
      {error && (
        <View>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="outline" onPress={load} style={{ marginTop: 16 }} />
        </View>
      )}

      {recipe && (
        <>
          <View style={{ height: 200, borderRadius: 28, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <BowlArt size={170} name={recipe.name} tags={recipe.tags} imageUrl={recipe.imageUrl} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 33, fontWeight: "600", letterSpacing: -0.8 }}>{recipe.name}</Text>
          <View style={{ flexDirection: "row", gap: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 12 }}>
            {stat("kcal", recipe.calories, "", true)}
            {stat("Protein", recipe.proteinG)}
            {stat("Carbs", recipe.carbsG)}
            {stat("Fat", recipe.fatG)}
          </View>
          <View style={{ gap: 10 }}>
            <Button title="Use on a day" onPress={() => setPicking(true)} />
            <Button title="I ate this" variant="outline" onPress={() => setEating(true)} />
            {logged && <Text style={{ color: c.ok, fontSize: 13 }}>Logged. It counts toward your calories.</Text>}
          </View>
          <View style={{ flexDirection: "row", backgroundColor: c.chip, borderRadius: 14, padding: 4 }} accessibilityRole="tablist">
            {(["ingr", "method"] as const).map((t) => (
              <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={{ flex: 1, height: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: tab === t ? c.white : "transparent" }}>
                <Text style={{ fontSize: 15, fontWeight: tab === t ? "600" : "500", color: tab === t ? c.ink : c.muted }}>{t === "ingr" ? "Ingredients" : "Method"}</Text>
              </Pressable>
            ))}
          </View>
          {tab === "ingr" ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
              {recipe.ingredients.map((i, n) => (
                <View key={`${i.name}-${n}`} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.line }}>
                  <Text style={{ fontSize: 16, flex: 1 }}>{cap(i.name)}</Text>
                  <Text style={{ fontSize: 16, color: c.muted }}>{qty(i)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View>
              {recipe.steps.length === 0 && <Muted>No steps for this recipe.</Muted>}
              {recipe.steps.map((s, n) => (
                <View key={n} style={{ flexDirection: "row", gap: 16, paddingVertical: 18, borderTopWidth: 1, borderTopColor: c.line }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "600", fontSize: 14 }}>{n + 1}</Text></View>
                  <Text style={{ flex: 1, fontSize: 16, lineHeight: 25 }}>{s}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {eating && recipe && <EatRecipeSheet recipeId={recipe.id} name={recipe.name} calories={recipe.calories} onClose={() => setEating(false)} onSaved={() => { setEating(false); setLogged(true); }} />}
      {picking && recipe && <DaySheet recipeId={recipe.id} onClose={() => setPicking(false)} />}
    </Page>
  );
}

type DayEntry = { id: string; mealType: string; position: number; recipe: { name: string } };
type Day = { date: string; entries: DayEntry[] };

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayLabel = (iso: string, long = false) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, long ? { weekday: "long", month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" });

/**
 * Put this recipe on a day of this week's plan. Two choices: add it as another meal (nothing is replaced), or replace
 * one of that day's meals (which also removes an "I ate it" log on the meal that was replaced). The server re-checks the
 * recipe against allergies and diet either way.
 */
function DaySheet({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [eaten, setEaten] = useState<Set<string>>(new Set()); // plan entries the user logged as eaten
  const [picked, setPicked] = useState<string | null>(null); // the chosen day
  const [mealType, setMealType] = useState<MealTypeName>("dinner");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { plan } = await api<{ plan: { weekStart: string; entries: (DayEntry & { date: string })[] } }>("/api/plan");
        const start = new Date(`${plan.weekStart.slice(0, 10)}T12:00:00`);
        const list: Day[] = Array.from({ length: 7 }, (_, n) => {
          const d = new Date(start);
          d.setDate(start.getDate() + n);
          const iso = isoOf(d);
          return { date: iso, entries: plan.entries.filter((e) => e.date.slice(0, 10) === iso).sort((a, b) => a.position - b.position) };
        });
        setDays(list);
        const today = isoOf(new Date());
        if (list[0].date <= today) {
          const { logs } = await api<{ logs: { entryId: string | null; status: string }[] }>(`/api/meal-logs?from=${list[0].date}&to=${today}`).catch(() => ({ logs: [] }));
          setEaten(new Set(logs.filter((l) => l.entryId && (l.status === "eaten_as_planned" || l.status === "modified")).map((l) => l.entryId as string)));
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  function fail(e: unknown) {
    setError(e instanceof ApiError && e.status === 422 ? "This recipe doesn't fit your allergies or diet, so it can't be added." : (e as Error).message);
    setBusy(null);
  }

  async function addTo(date: string) {
    setBusy("add");
    setError(null);
    try {
      await api("/api/plan/entries", { method: "POST", json: { date, mealType, recipeId } });
      onClose();
      router.replace("/today");
    } catch (e) {
      fail(e);
    }
  }

  async function replace(entryId: string) {
    setBusy(entryId);
    setError(null);
    try {
      await api("/api/swap", { method: "POST", json: { entryId, recipeId } });
      onClose();
      router.replace("/today");
    } catch (e) {
      fail(e);
    }
  }

  const day = days?.find((d) => d.date === picked) ?? null;

  return (
    <Sheet title={day ? dayLabel(day.date, true) : "Use on a day"} onClose={onClose}>
      {!days && !error && <View style={{ paddingVertical: 24 }}><Spinner /></View>}
      {days && !day && (
        <>
          <Muted style={{ marginBottom: 12 }}>Pick a day. Next you choose to add it as another meal or replace one. It's checked against your allergies and diet first.</Muted>
          {days.map((d) => (
            <Pressable key={d.date} accessibilityRole="button" onPress={() => setPicked(d.date)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
              <View style={{ width: 112 }}><Text style={{ fontSize: 15, fontWeight: "600" }}>{dayLabel(d.date)}</Text></View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.muted }}>{d.entries.length ? d.entries.map((e) => e.recipe.name).join(" · ") : "No meals yet"}</Text>
            </Pressable>
          ))}
        </>
      )}
      {day && (
        <>
          <Pressable accessibilityRole="button" onPress={() => { setPicked(null); setError(null); }} style={{ paddingVertical: 8, marginBottom: 6 }}>
            <Text style={{ color: c.brand, fontWeight: "600", fontSize: 14 }}>‹ All days</Text>
          </Pressable>
          <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 4 }}>Add as another meal</Text>
          <Muted style={{ marginBottom: 10, fontSize: 13 }}>Keeps everything already on {dayLabel(day.date)}, including what you logged.</Muted>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={mealType === m} onPress={() => setMealType(m)} />)}
          </View>
          <Button title={`Add to ${dayLabel(day.date)}`} onPress={() => addTo(day.date)} loading={busy === "add"} disabled={busy !== null} />
          {day.entries.length > 0 && (
            <>
              <Text style={{ fontSize: 14, fontWeight: "600", marginTop: 20, marginBottom: 4 }}>Or replace one</Text>
              <Muted style={{ marginBottom: 4, fontSize: 13 }}>Use this if you won't eat that meal. Replacing removes any "ate it" log on it.</Muted>
              {day.entries.map((e) => (
                <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Replace ${e.recipe.name}`} disabled={busy !== null} onPress={() => replace(e.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line, opacity: busy && busy !== e.id ? 0.4 : 1 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15 }}>{e.recipe.name}</Text>
                    <Text style={{ fontSize: 12, color: c.muted }}>{cap(e.mealType)}{eaten.has(e.id) ? " · logged as eaten, replacing removes the log" : ""}</Text>
                  </View>
                  {busy === e.id ? <Spinner /> : <Text style={{ color: c.brand, fontWeight: "600", fontSize: 14 }}>Replace</Text>}
                </Pressable>
              ))}
            </>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
