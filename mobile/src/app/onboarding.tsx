import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Button, Chip, ErrorText, Input, Label, Muted, Segmented, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dailyTarget, tdee, type ActivityLevel, type Goal, type Sex } from "@/lib/calories";
import { c } from "@/lib/theme";
import { ACTIVITY, ALLERGENS, CUISINE_GROUPS, DIETS, EQUIPMENT, PACE, closestPace, toggle, type Pace } from "@/lib/vocab";

type Form = {
  sex: Sex; age: string; heightCm: string; weightKg: string; activityLevel: ActivityLevel;
  goal: Goal; pace: Pace; diet: string | null; allergies: string[]; equipment: string[]; cuisines: string[];
};
const EMPTY: Form = { sex: "male", age: "", heightCm: "", weightKg: "", activityLevel: "moderate", goal: "lose", pace: "steady", diet: null, allergies: [], equipment: [], cuisines: [] };

type Saved = { heightCm: number | null; weightKg: number | null; age: number | null; sex: Sex | null; activityLevel: ActivityLevel | null; goal: Goal | null; goalRateKg: number | null; cuisines: string[]; diet: string | null; allergies: string[]; equipment: string[] } | null;

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [f, setF] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | "profile" | "plan">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }));

  // Pre-fill when the user already has a profile (editing their answers).
  useEffect(() => {
    api<{ profile: Saved }>("/api/profile")
      .then(({ profile: p }) => {
        if (!p) return;
        setF((cur) => ({
          ...cur,
          sex: p.sex ?? cur.sex, age: p.age?.toString() ?? "", heightCm: p.heightCm?.toString() ?? "", weightKg: p.weightKg?.toString() ?? "",
          activityLevel: p.activityLevel ?? cur.activityLevel, goal: p.goal ?? cur.goal, pace: closestPace(p.goalRateKg),
          diet: p.diet && p.diet in DIETS ? p.diet : null,
          allergies: p.allergies.filter((a) => a in ALLERGENS), equipment: p.equipment.filter((e) => e in EQUIPMENT),
          cuisines: p.cuisines,
        }));
      })
      .catch(() => {}) // first-time users have no profile
      .finally(() => setLoading(false));
  }, []);

  const age = num(f.age), heightCm = num(f.heightCm), weightKg = num(f.weightKg);
  const bodyValid = inRange(age, 13, 100) && inRange(heightCm, 100, 250) && inRange(weightKg, 30, 300);
  const bodyError =
    f.age && !inRange(age, 13, 100) ? "Age must be 13 to 100." : f.heightCm && !inRange(heightCm, 100, 250) ? "Height must be 100 to 250 cm." : f.weightKg && !inRange(weightKg, 30, 300) ? "Weight must be 30 to 300 kg." : null;
  const stats = bodyValid ? { age: Math.round(age), heightCm, weightKg, sex: f.sex, activityLevel: f.activityLevel } : null;
  const goalRateKg = f.goal === "maintain" ? null : PACE[f.pace];
  // The same functions the backend uses, so the preview matches what gets saved.
  const maintenance = stats ? Math.round(tdee(stats)) : null;
  const target = stats ? dailyTarget(stats, f.goal, goalRateKg) : null;

  async function finish() {
    if (!stats) return;
    setError(null);
    setSaving("profile");
    try {
      await api("/api/profile", { method: "PUT", json: { ...stats, goal: f.goal, goalRateKg, diet: f.diet, allergies: f.allergies, equipment: f.equipment, cuisines: f.cuisines } });
      setSaving("plan");
      await api("/api/plan", { method: "POST", json: {} }).catch(() => {}); // not fatal: Today can build the plan later
      router.replace("/today");
    } catch (e) {
      setSaving(null);
      setError(e instanceof ApiError && e.status === 400 ? "Some answers look off. Check your numbers and try again." : (e as Error).message);
    }
  }

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Spinner /></View>;

  const goBack = step > 1 ? () => setStep(step - 1) : undefined;

  const footer = (button: ReactNode, extra?: ReactNode) => (
    <View style={{ padding: 20, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.white }}>
      {extra}
      {button}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.white }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 14 }}>
        <View accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of 4`} accessibilityValue={{ min: 1, max: 4, now: step }} style={{ flexDirection: "row", gap: 6 }}>
          {[1, 2, 3, 4].map((n) => <View key={n} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: n <= step ? c.brand : c.line }} />)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 48, marginTop: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} disabled={!goBack} style={{ width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center", opacity: goBack ? 1 : 0 }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5 8 12l7 7" /></Svg>
          </Pressable>
          <Text style={{ fontSize: 13, color: c.muted }}>Step {step} of 4</Text>
        </View>
      </View>

      {/* key={step}: each step starts at the top instead of keeping the previous step's scroll position */}
      <ScrollView key={step} contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 32, gap: 22 }} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <Heading title="Let's size your daily calories" sub="We use these once to set a starting target, then adjust it from your weekly weigh-ins." />
            <View><Label>Sex</Label><Segmented<Sex> options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} value={f.sex} onChange={(sex) => set({ sex })} /></View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}><Label>Age</Label><Input value={f.age} onChangeText={(age) => set({ age })} keyboardType="number-pad" placeholder="28" /></View>
              <View style={{ flex: 1 }}><Label>Height cm</Label><Input value={f.heightCm} onChangeText={(heightCm) => set({ heightCm })} keyboardType="decimal-pad" placeholder="178" /></View>
              <View style={{ flex: 1 }}><Label>Weight kg</Label><Input value={f.weightKg} onChangeText={(weightKg) => set({ weightKg })} keyboardType="decimal-pad" placeholder="82" /></View>
            </View>
            <ErrorText>{bodyError}</ErrorText>
            <View>
              <Label>Activity in a normal week</Label>
              <View style={{ gap: 8 }}>
                {ACTIVITY.map((a) => (
                  <Pressable key={a.value} accessibilityRole="radio" accessibilityState={{ selected: f.activityLevel === a.value }} onPress={() => set({ activityLevel: a.value })} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderRadius: 14, borderWidth: f.activityLevel === a.value ? 2 : 1, borderColor: f.activityLevel === a.value ? c.brand : c.line, backgroundColor: f.activityLevel === a.value ? c.brandSoft : c.white }}>
                    <Text style={{ fontSize: 15 }}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 18 }}>
              <Muted style={{ fontSize: 13 }}>Estimated maintenance</Muted>
              <Text style={{ fontSize: 34, fontWeight: "600", letterSpacing: -1, color: c.brand }}>{maintenance?.toLocaleString() ?? "–"} <Text style={{ fontSize: 15, fontWeight: "500", color: c.muted }}>kcal / day</Text></Text>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Heading title="What's your goal?" sub="Your daily calories start here!" />
            <View style={{ gap: 10 }}>
              {([["lose", "Lose weight", "Eat a little under maintenance"], ["maintain", "Maintain weight", "Stay where you are"], ["gain", "Build muscle", "Eat a little over maintenance"]] as [Goal, string, string][]).map(([value, title, desc]) => {
                const on = f.goal === value;
                return (
                  <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => set({ goal: value })} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, borderWidth: on ? 2 : 1, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.white }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 6 : 1.5, borderColor: on ? c.brand : "#C9C9C5", backgroundColor: c.white }} />
                    <View><Text style={{ fontSize: 16, fontWeight: "500" }}>{title}</Text><Muted style={{ fontSize: 13 }}>{desc}</Muted></View>
                  </Pressable>
                );
              })}
            </View>
            {f.goal !== "maintain" && (
              <View>
                <Label>Pace</Label>
                <Segmented<Pace> height={48} options={[{ value: "gentle", label: "Gentle" }, { value: "steady", label: "Steady" }, { value: "faster", label: "Faster" }]} value={f.pace} onChange={(pace) => set({ pace })} />
                <Muted style={{ fontSize: 13, marginTop: 8 }}>About {PACE[f.pace]} kg per week</Muted>
              </View>
            )}
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Muted>Your starting target</Muted>
                <Text style={{ fontSize: 22, fontWeight: "600", color: c.brand }}>{target?.toLocaleString() ?? "–"} kcal</Text>
              </View>
              <Muted style={{ fontSize: 12, marginTop: 4 }}>We never go below a safe calorie floor, whatever pace you pick.</Muted>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Heading title="What should we always respect?" sub="Recipes that break these rules are removed before anything is ranked." />
            <View>
              <Label>Eating style</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="No restriction" selected={f.diet === null} onPress={() => set({ diet: null })} />
                {Object.entries(DIETS).map(([k, label]) => <Chip key={k} label={label} selected={f.diet === k} onPress={() => set({ diet: k })} />)}
              </View>
            </View>
            <View>
              <Label>Allergies</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(ALLERGENS).map(([k, label]) => <Chip key={k} variant="danger" label={label} selected={f.allergies.includes(k)} onPress={() => set({ allergies: toggle(f.allergies, k) })} />)}
              </View>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 14, padding: 14 }}>
              <Muted style={{ fontSize: 13, lineHeight: 21 }}>Allergies are checked again after the AI picks a recipe, so a mistake can never put an allergen on your plan.</Muted>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <Heading title="What's in your kitchen?" sub="Recipes that need a tool you don't have stay available. You can convert the steps on the recipe screen." />
            <View>
              <Label>Your equipment</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(EQUIPMENT).map(([k, label]) => <Chip key={k} label={label} selected={f.equipment.includes(k)} onPress={() => set({ equipment: toggle(f.equipment, k) })} />)}
              </View>
            </View>
            <View style={{ gap: 16 }}>
              <Label>Cuisines you like</Label>
              {CUISINE_GROUPS.map((g) => (
                <View key={g.name}>
                  <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{g.name}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {Object.entries(g.items).map(([k, label]) => <Chip key={k} label={label} selected={f.cuisines.includes(k)} onPress={() => set({ cuisines: toggle(f.cuisines, k) })} />)}
                  </View>
                </View>
              ))}
            </View>
            <Muted style={{ fontSize: 13 }}>These are only a starting point. The planner learns from what you keep, swap and skip.</Muted>
            <ErrorText>{error}</ErrorText>
          </>
        )}
      </ScrollView>

      {step === 1 && footer(<Button title="Continue" disabled={!bodyValid} onPress={() => setStep(2)} />)}
      {step === 2 && footer(<Button title="Continue" onPress={() => setStep(3)} />)}
      {step === 3 && footer(<Button title="Continue" onPress={() => setStep(4)} />)}
      {step === 4 && footer(<Button title="Start my plan" loading={saving !== null} onPress={finish} />, saving === "plan" ? <Muted style={{ textAlign: "center", marginBottom: 8, fontSize: 13 }}>Building your week…</Muted> : null)}
    </KeyboardAvoidingView>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <View>
      <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 33, fontWeight: "600", letterSpacing: -0.8, marginBottom: 10 }}>{title}</Text>
      <Muted style={{ fontSize: 16, lineHeight: 24 }}>{sub}</Muted>
    </View>
  );
}
