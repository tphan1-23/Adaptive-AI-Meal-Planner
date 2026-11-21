import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import BowlArt from "@/components/BowlArt";
import { Button, Chip, ErrorText, H1, Input, Muted, Page, Segmented, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { RecipeCard, RecipePage } from "@/lib/api-types";
import { c } from "@/lib/theme";
import { MEAL_TYPES, cap, niceName, type MealTypeName } from "@/lib/vocab";

// Tags that say little about the dish; skip them in the subtitle.
const GENERIC = new Set(["main-dish", "dinner", "course", "time-to-make", "preparation", "occasion", "cuisine", "north-american", "dietary", "equipment", "easy", "healthy", "main-ingredient", "meat", "weeknight", "60-minutes-or-less", "30-minutes-or-less", "15-minutes-or-less", "4-hours-or-less"]);

type Scope = "all" | "saved";
type Sort = "for-you" | "name" | "calories";
const SORTS: { value: Sort; label: string }[] = [
  { value: "for-you", label: "For you" },
  { value: "name", label: "A to Z" },
  { value: "calories", label: "Lightest" },
];
const PAGE = 20;

/** Every recipe that is safe for you: search, filter by meal, sort, and open one to swap it in or log it as eaten. */
export default function Recipes() {
  const [scope, setScope] = useState<Scope>("all");
  const [text, setText] = useState("");
  const [q, setQ] = useState(""); // the search text, after a short pause in typing
  const [meal, setMeal] = useState<MealTypeName | null>(null);
  const [sort, setSort] = useState<Sort>("for-you");
  const [items, setItems] = useState<RecipeCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0); // ignore answers from an older search

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const query = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ sort, limit: String(PAGE), offset: String(offset) });
      if (q) p.set("q", q);
      if (meal) p.set("mealType", meal);
      if (scope === "saved") p.set("saved", "true");
      return `/api/recipes?${p.toString()}`;
    },
    [q, meal, sort, scope],
  );

  const load = useCallback(async () => {
    const id = ++run.current;
    setError(null);
    try {
      const page = await api<RecipePage>(query(0));
      if (id !== run.current) return;
      setItems(page.recipes);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (e) {
      if (id === run.current) setError((e as Error).message);
    }
  }, [query]);

  // Search again whenever a filter changes, and when the tab is shown (so a recipe saved elsewhere is right here).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function more() {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    const id = run.current;
    try {
      const page = await api<RecipePage>(query(items.length));
      if (id !== run.current) return;
      setItems((cur) => [...(cur ?? []), ...page.recipes.filter((r) => !(cur ?? []).some((x) => x.id === r.id))]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleHeart(r: RecipeCard) {
    const next = !r.isFavorite;
    // Update the row right away; in the Saved list an un-hearted recipe leaves it. Undo if the call fails.
    setItems((list) => (list ? (scope === "saved" && !next ? list.filter((x) => x.id !== r.id) : list.map((x) => (x.id === r.id ? { ...x, isFavorite: next } : x))) : list));
    try {
      await api("/api/favorites", { method: next ? "POST" : "DELETE", json: { recipeId: r.id } });
    } catch {
      load();
    }
  }

  return (
    <Page>
      <View style={{ gap: 6 }}>
        <H1>Recipes</H1>
        <Muted>Everything that fits your diet and allergies. Open one to put it on a day or log it as eaten.</Muted>
      </View>

      <Segmented<Scope>
        height={44}
        options={[
          { value: "all", label: "All recipes" },
          { value: "saved", label: "Saved" },
        ]}
        value={scope}
        onChange={setScope}
      />
      <Input accessibilityLabel="Search recipes" value={text} onChangeText={setText} placeholder="Search: chicken, soup, pasta…" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />

      <View style={{ gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }} contentInset={{ left: 20, right: 20 }}>
          <View style={{ width: 12 }} />
          <Chip label="Any meal" selected={meal === null} onPress={() => setMeal(null)} />
          {MEAL_TYPES.map((m) => <Chip key={m} label={cap(m)} selected={meal === m} onPress={() => setMeal(meal === m ? null : m)} />)}
          <View style={{ width: 12 }} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }}>
          <View style={{ width: 12 }} />
          {SORTS.map((s) => <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />)}
          <View style={{ width: 12 }} />
        </ScrollView>
      </View>

      {!items && !error && <View style={{ paddingVertical: 60 }}><Spinner /></View>}
      {error && (
        <View>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="outline" onPress={load} style={{ marginTop: 16 }} />
        </View>
      )}
      {items && items.length === 0 && !error && (
        <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 17, fontWeight: "600" }}>{scope === "saved" && !q && !meal ? "Nothing saved yet" : "No recipes match"}</Text>
          <Muted style={{ textAlign: "center" }}>
            {scope === "saved" && !q && !meal ? "Tap the heart on any recipe to keep it here." : "Try a different word or filter. Recipes with your allergens are never listed."}
          </Muted>
          {scope === "saved" && !q && !meal && <Button title="Browse all recipes" variant="outline" onPress={() => setScope("all")} style={{ marginTop: 12, alignSelf: "stretch" }} />}
        </View>
      )}
      {items && items.length > 0 && <Text style={{ fontSize: 13, color: c.muted }}>{total.toLocaleString()} recipe{total === 1 ? "" : "s"}{q ? ` for "${q}"` : ""}</Text>}

      {items?.map((r) => {
        const sub = r.tags.filter((t) => !GENERIC.has(t)).slice(0, 2).map(niceName).join(" · ");
        return (
          <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.name}`} onPress={() => router.push(`/recipes/saved/${r.id}`)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72 }}>
              <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <BowlArt size={52} name={r.name} tags={r.tags} imageUrl={r.imageUrl} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: "500" }}>{r.name}</Text>
                <Text style={{ fontSize: 13, color: c.muted }}>
                  {Math.round(r.calories)} kcal{sub ? ` · ${sub}` : ""}{r.source === "ai" ? " · AI-made" : ""}
                </Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={r.isFavorite ? `Remove ${r.name} from saved` : `Save ${r.name}`} onPress={() => toggleHeart(r)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill={r.isFavorite ? c.brand : "none"} stroke={r.isFavorite ? c.brand : c.muted} strokeWidth={2} strokeLinejoin="round">
                <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" />
              </Svg>
            </Pressable>
          </View>
        );
      })}
      {hasMore && <Button title="Show more" variant="outline" onPress={more} loading={loadingMore} />}
    </Page>
  );
}
