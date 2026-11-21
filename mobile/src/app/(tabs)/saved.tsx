import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import BowlArt from "@/components/BowlArt";
import { Button, ErrorText, H1, Muted, Page, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { SavedRecipe } from "@/lib/api-types";
import { c } from "@/lib/theme";
import { niceName } from "@/lib/vocab";

// Tags that say little about the dish; skip them in the subtitle.
const GENERIC = new Set(["main-dish", "dinner", "course", "time-to-make", "preparation", "occasion", "cuisine", "north-american", "dietary", "equipment", "easy", "healthy", "main-ingredient", "meat", "weeknight", "60-minutes-or-less", "30-minutes-or-less", "15-minutes-or-less", "4-hours-or-less"]);

export default function Saved() {
  const [items, setItems] = useState<SavedRecipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ favorites: SavedRecipe[] }>("/api/favorites")).favorites);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Reload whenever the tab is shown, so a recipe saved on the recipe screen appears here.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function unsave(r: SavedRecipe) {
    setItems((list) => (list ? list.filter((x) => x.id !== r.id) : list)); // remove right away, restore if it fails
    try {
      await api("/api/favorites", { method: "DELETE", json: { recipeId: r.id } });
    } catch {
      load();
    }
  }

  return (
    <Page>
      <View>
        <H1>Saved</H1>
        <Muted>Recipes you've hearted. Saving also teaches the planner your tastes.</Muted>
      </View>

      {!items && !error && <View style={{ paddingVertical: 60 }}><Spinner /></View>}
      {error && (
        <View>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="outline" onPress={load} style={{ marginTop: 16 }} />
        </View>
      )}
      {items && items.length === 0 && (
        <View style={{ paddingVertical: 48, alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 17, fontWeight: "600" }}>Nothing saved yet</Text>
          <Muted style={{ textAlign: "center" }}>Tap the heart on any recipe to keep it here.</Muted>
          <Button title="Go to Today" variant="outline" onPress={() => router.push("/today")} style={{ marginTop: 12, alignSelf: "stretch" }} />
        </View>
      )}
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
                <Text style={{ fontSize: 13, color: c.muted }}>{Math.round(r.calories)} kcal{sub ? ` · ${sub}` : ""}</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${r.name} from saved`} onPress={() => unsave(r)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill={c.brand} stroke={c.brand} strokeWidth={2} strokeLinejoin="round">
                <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" />
              </Svg>
            </Pressable>
          </View>
        );
      })}
    </Page>
  );
}
