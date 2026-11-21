import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import BowlArt from "@/components/BowlArt";
import { Button, ErrorText, Muted, Page, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { c } from "@/lib/theme";
import { cap } from "@/lib/vocab";

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
  const [favorite, setFavorite] = useState(true);
  const [tab, setTab] = useState<"ingr" | "method">("ingr");
  const [error, setError] = useState<string | null>(null);

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
    </Page>
  );
}
