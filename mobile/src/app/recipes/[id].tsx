import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import BowlArt from "@/components/BowlArt";
import { LogMealSheet } from "@/components/MealSheets";
import { Button, Chip, ErrorText, Muted, Page, Sheet, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Entry, MealLog, Profile } from "@/lib/api-types";
import { addDays, dayKey, isoDay } from "@/lib/dates";
import { c } from "@/lib/theme";
import { EQUIPMENT, cap, niceName, toggle } from "@/lib/vocab";

type Recipe = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
  tags: string[];
  equipment: string[];
  imageUrl: string | null;
  isFavorite: boolean;
};
type Detail = {
  entry: Entry;
  recipe: Recipe;
  convertedSteps: string[];
  convertedForEquipment: string[];
  modifiedRecipe: Partial<Recipe> | null;
};
type Substitute = { name: string; quality: "close" | "rough"; grams: number; note: string };

// Dataset recipes carry placeholder quantities ("1 item"): show only real ones.
const qty = (i: Recipe["ingredients"][number]) => (i.unit === "item" ? "" : `${+i.quantity.toFixed(2)} ${i.unit}`);

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [existingLog, setExistingLog] = useState<MealLog | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ingr" | "method">("method");
  const [showOriginal, setShowOriginal] = useState(false);
  const [cookWith, setCookWith] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [swapIngredient, setSwapIngredient] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [d, p] = await Promise.all([api<Detail>(`/api/entries/${id}`), api<{ profile: Profile | null }>("/api/profile")]);
      setDetail(d);
      setProfile(p.profile);
      setFavorite(d.recipe.isFavorite);
      setCookWith(d.convertedForEquipment.length > 0 ? d.convertedForEquipment : (p.profile?.equipment ?? []));
      const day = dayKey(d.entry.date);
      const logs = await api<{ logs: MealLog[] }>(`/api/meal-logs?from=${day}&to=${day}`).catch(() => ({ logs: [] as MealLog[] }));
      setExistingLog(logs.logs.find((l) => l.entryId === d.entry.id) ?? null);
      setState("ready");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "We couldn't find that meal." : (e as Error).message);
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function convert() {
    if (cookWith.length === 0) return setConvertNote("Pick at least one appliance to cook with.");
    setConverting(true);
    setConvertNote(null);
    try {
      const res = await api<{ available: boolean; steps: string[]; note: string; equipment: string[] }>("/api/convert", { method: "POST", json: { entryId: id, equipment: cookWith } });
      if (!res.available) setConvertNote(res.note || "We couldn't convert this one right now. The original steps are shown.");
      else setDetail((d) => (d ? { ...d, convertedSteps: res.steps, convertedForEquipment: res.equipment ?? cookWith } : d));
      setShowOriginal(false);
    } catch (e) {
      setConvertNote(e instanceof ApiError && e.status === 429 ? "Please wait a minute and try again." : (e as Error).message);
    } finally {
      setConverting(false);
    }
  }

  async function toggleFavorite() {
    if (!detail) return;
    const next = !favorite;
    setFavorite(next); // update right away, undo if it fails
    try {
      await api("/api/favorites", { method: next ? "POST" : "DELETE", json: { recipeId: detail.recipe.id } });
    } catch {
      setFavorite(!next);
    }
  }

  const header = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: -10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/today"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M15 5 8 12l7 7" />
        </Svg>
      </Pressable>
      {state === "ready" && (
        <Pressable accessibilityRole="button" accessibilityLabel={favorite ? "Remove from saved recipes" : "Save recipe"} accessibilityState={{ selected: favorite }} onPress={toggleFavorite} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill={favorite ? c.brand : "none"} stroke={favorite ? c.brand : c.ink} strokeWidth={2} strokeLinejoin="round">
            <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" />
          </Svg>
        </Pressable>
      )}
    </View>
  );

  if (state !== "ready" || !detail) {
    return (
      <Page>
        {header}
        {state === "loading" ? <View style={{ paddingVertical: 60 }}><Spinner /></View> : (
          <View>
            <ErrorText>{error}</ErrorText>
            <Button title="Try again" variant="outline" onPress={load} style={{ marginTop: 16 }} />
          </View>
        )}
      </Page>
    );
  }

  const { recipe, entry } = detail;
  const shown = { ...recipe, ...(detail.modifiedRecipe ?? {}) } as Recipe; // the user's own version wins
  const ingredients = shown.ingredients ?? [];
  const converted = detail.convertedSteps.length > 0 && !showOriginal;
  const steps = converted ? detail.convertedSteps : shown.steps ?? [];
  const safeFor = (profile?.allergies ?? []).map(cap);
  const tomorrow = isoDay(addDays(new Date(), 1));
  const canLog = dayKey(entry.date) <= tomorrow;
  const needs = (shown.equipment ?? []).filter((e) => !(profile?.equipment ?? []).includes(e));

  return (
    <View style={{ flex: 1, backgroundColor: c.white }}>
      <Page bottom={24}>
        {header}
        <View style={{ height: 200, borderRadius: 28, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <BowlArt size={170} name={shown.name} tags={shown.tags} imageUrl={recipe.imageUrl} />
        </View>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 33, fontWeight: "600", letterSpacing: -0.8 }}>
            {shown.name}
          </Text>
          <Muted style={{ fontSize: 15 }}>
            {entry.mealType ? `${cap(entry.mealType)} · ` : ""}
            <Text style={{ color: c.brand, fontWeight: "600" }}>{Math.round(shown.calories)} kcal</Text>
            {shown.proteinG != null ? ` · ${Math.round(shown.proteinG)} g protein` : ""}
          </Muted>
        </View>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: c.surface, borderRadius: 14, padding: 14 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2.4}>
            <Path d="M4 12.5 9.5 18 20 6" />
          </Svg>
          <Muted style={{ flex: 1, fontSize: 13, lineHeight: 20 }}>
            <Text style={{ color: c.ink, fontWeight: "600" }}>{safeFor.length ? "Safe for you. " : "Matches your plan. "}</Text>
            {safeFor.length ? `Checked for ${safeFor.join(", ").toLowerCase()}, twice.` : "Checked against your eating style."}
          </Muted>
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
            {ingredients.map((i, n) => (
              <View key={`${i.name}-${n}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16 }}>{cap(i.name)}</Text>
                  {qty(i) ? <Text style={{ fontSize: 13, color: c.muted }}>{qty(i)}</Text> : null}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Find a swap for ${i.name}`} onPress={() => setSwapIngredient(i.name)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line, justifyContent: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "600" }}>Swap</Text>
                </Pressable>
              </View>
            ))}
            <Button title="See shopping list" variant="outline" onPress={() => router.push("/shopping")} style={{ marginVertical: 16 }} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ backgroundColor: c.surface, borderRadius: 18, padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600" }}>Cook it a different way</Text>
              <Muted style={{ fontSize: 13 }}>
                {needs.length > 0 ? `This recipe uses ${needs.map(niceName).join(", ").toLowerCase()}. ` : ""}
                Pick what you want to use and we'll rewrite the steps for it.
              </Muted>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(EQUIPMENT).map(([k, label]) => <Chip key={k} label={label} selected={cookWith.includes(k)} onPress={() => setCookWith(toggle(cookWith, k))} />)}
              </View>
              <Button title={detail.convertedSteps.length > 0 ? "Convert again" : "Convert steps"} onPress={convert} loading={converting} style={{ minHeight: 48 }} />
              {converting && <Muted style={{ fontSize: 13 }}>This can take up to 30 seconds.</Muted>}
              {convertNote ? <Muted style={{ fontSize: 13 }}>{convertNote}</Muted> : null}
            </View>

            {detail.convertedSteps.length > 0 && (
              <View style={{ backgroundColor: converted ? c.brandSoft : c.surface, borderRadius: 18, padding: 16 }}>
                <Text style={{ fontSize: 14, lineHeight: 21 }}>
                  <Text style={{ fontWeight: "600", color: converted ? c.brandDark : c.ink }}>
                    {converted ? `Converted for ${detail.convertedForEquipment.map((e) => e.replace("-", " ")).join(", ")}. ` : "Original steps. "}
                  </Text>
                  <Text style={{ color: c.muted }}>{converted ? "The AI adjusted the steps, so check times the first time." : "Tap below to see the converted steps again."}</Text>
                </Text>
                <Button title={converted ? "Show original" : "Show converted"} variant="outline" onPress={() => setShowOriginal(converted)} style={{ marginTop: 12, minHeight: 48 }} />
              </View>
            )}

            {steps.length === 0 && <Muted style={{ paddingVertical: 16 }}>No steps for this recipe.</Muted>}
            {steps.map((s, n) => (
              <View key={n} style={{ flexDirection: "row", gap: 16, paddingVertical: 18, borderTopWidth: 1, borderTopColor: c.line }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.chip, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontWeight: "600", fontSize: 14 }}>{n + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 16, lineHeight: 25 }}>{s}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      <View style={{ padding: 20, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.white }}>
        <Button title={existingLog ? `Logged: ${existingLog.status === "skipped" ? "skipped" : existingLog.status === "modified" ? "changed" : "ate it"} (edit)` : "Log this meal"} onPress={() => setLogOpen(true)} disabled={!canLog} />
        {!canLog && <Muted style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}>You can log a meal up to tomorrow.</Muted>}
      </View>

      {logOpen && <LogMealSheet entryId={entry.id} planned={Math.round(shown.calories)} existing={existingLog} onClose={() => setLogOpen(false)} onSaved={(l) => { setExistingLog(l); setLogOpen(false); }} />}
      {swapIngredient && <IngredientSheet entryId={entry.id} ingredient={swapIngredient} onClose={() => setSwapIngredient(null)} />}
    </View>
  );
}

/** Suggested replacements for one ingredient: matched on calories and macros in code, never containing the user's allergens. */
function IngredientSheet({ entryId, ingredient, onClose }: { entryId: string; ingredient: string; onClose: () => void }) {
  const [subs, setSubs] = useState<Substitute[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ substitutes: Substitute[] }>("/api/substitute", { method: "POST", json: { entryId, ingredient } })
      .then((r) => setSubs(r.substitutes))
      .catch((e) => {
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 422 || status === 404) setSubs([]); // nothing we can match
        else setError(status === 429 ? "Please wait a minute and try again." : (e as Error).message);
      });
  }, [entryId, ingredient]);

  return (
    <Sheet title={`Swap ${ingredient}`} onClose={onClose}>
      <Muted style={{ marginBottom: 12 }}>Close swaps by calories and nutrition, checked against your allergies and diet.</Muted>
      {!subs && !error && <View style={{ paddingVertical: 28 }}><Spinner /></View>}
      {subs && subs.length === 0 && <Muted style={{ paddingVertical: 12 }}>No close swap for this one. It's best kept as it is.</Muted>}
      {subs?.map((s) => (
        <View key={s.name} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "600" }}>{cap(s.name)}</Text>
            {s.quality === "rough" && <Text style={{ fontSize: 12, color: c.muted, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>rougher match</Text>}
          </View>
          <Muted style={{ fontSize: 14 }}>{s.note}</Muted>
        </View>
      ))}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
