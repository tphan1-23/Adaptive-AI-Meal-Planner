import { useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { Button, Chip, ErrorText, H1, H2, Input, Label, Muted, Page, Segmented, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/api-types";
import { dailyTarget, tdee, type ActivityLevel, type Goal, type Sex } from "@/lib/calories";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { c } from "@/lib/theme";
import { ACTIVITY, ALLERGENS, CUISINE_GROUPS, DIETS, EQUIPMENT, PACE, closestPace, niceName, toggle, type Pace } from "@/lib/vocab";

type Section = "body" | "food" | "kitchen" | "tastes" | "password" | "delete" | null;
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

export default function Me() {
  const { session } = useSession();
  const email = session?.user.email ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Section>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProfile((await api<{ profile: Profile | null }>("/api/profile")).profile);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Saves the whole profile with one part changed. The API recomputes the calorie target only if body, goal or pace changed. */
  async function saveProfile(patch: Partial<Profile>) {
    if (!profile) return;
    const p = { ...profile, ...patch };
    const res = await api<{ profile: Profile }>("/api/profile", {
      method: "PUT",
      json: {
        heightCm: p.heightCm, weightKg: p.weightKg, age: p.age, sex: p.sex, activityLevel: p.activityLevel, goal: p.goal,
        goalRateKg: p.goal === "maintain" ? null : (p.goalRateKg ?? 0.5),
        cuisines: p.cuisines, diet: p.diet, allergies: p.allergies, equipment: p.equipment,
      },
    });
    setProfile(res.profile);
    setOpen(null);
    setNotice("Saved. Your plan updates when you open Today.");
  }

  const row = (key: Exclude<Section, null>, title: string, summary: string, body: ReactNode) => (
    <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 20, padding: 16, gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === key }} onPress={() => { setOpen(open === key ? null : key); setNotice(null); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>{title}</Text>
          <Text numberOfLines={open === key ? undefined : 2} style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{summary}</Text>
        </View>
        <Text style={{ color: c.brand, fontWeight: "600" }}>{open === key ? "Close" : "Edit"}</Text>
      </Pressable>
      {open === key && body}
    </View>
  );

  return (
    <Page>
      <View>
        <H1>Settings</H1>
        <Muted>{email}</Muted>
      </View>
      {error && <ErrorText>{error}</ErrorText>}
      {!profile && !error && <View style={{ paddingVertical: 40 }}><Spinner /></View>}
      {notice && <View style={{ backgroundColor: c.surface, borderRadius: 14, padding: 14 }}><Text style={{ fontSize: 14, color: c.ink }}>{notice}</Text></View>}

      {profile && (
        <>
          <H2>Your plan</H2>
          {row("body", "Body and goal", `${profile.heightCm ?? "?"} cm · ${profile.weightKg ?? "?"} kg · ${profile.age ?? "?"} y · goal: ${profile.goal ?? "?"} · target ${profile.calorieTarget.toLocaleString()} kcal`, <BodyEditor profile={profile} onSave={saveProfile} />)}
          {row("food", "Eating style and allergies", `${profile.diet ? niceName(profile.diet) : "No restriction"} · ${profile.allergies.length ? profile.allergies.map(niceName).join(", ") : "no allergies"}`, <FoodEditor profile={profile} onSave={saveProfile} />)}
          {row("kitchen", "Kitchen equipment", profile.equipment.length ? profile.equipment.map(niceName).join(", ") : "None selected", <ChipEditor items={EQUIPMENT} initial={profile.equipment} onSave={(equipment) => saveProfile({ equipment })} />)}
          {row("tastes", "Cuisines you like", profile.cuisines.length ? profile.cuisines.map(niceName).join(", ") : "None selected", <CuisineEditor initial={profile.cuisines} onSave={(cuisines) => saveProfile({ cuisines })} />)}

          <H2>Account</H2>
          {row("password", "Change password", "Needs your current password", <PasswordEditor email={email} onDone={() => { setOpen(null); setNotice("Password changed."); }} />)}
          <Button title="Sign out" variant="outline" onPress={() => supabase.auth.signOut()} />
          {row("delete", "Delete account", "Permanently removes your data and login", <DeleteEditor />)}

          <H2>About</H2>
          <View style={{ gap: 8 }}>
            <Muted style={{ fontSize: 13, lineHeight: 20 }}>
              This app gives general meal ideas and calorie estimates. It is not medical advice. Talk to a doctor or dietitian about your health, allergies and weight goals.
            </Muted>
            <Muted style={{ fontSize: 13, lineHeight: 20 }}>
              Recipes come from the Food.com dataset and nutrition from USDA data. Dish photos are from Wikipedia / Wikimedia Commons, each under its own free license.
            </Muted>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://commons.wikimedia.org")}>
              <Text style={{ color: c.brand, fontSize: 13, fontWeight: "600" }}>About Wikimedia Commons</Text>
            </Pressable>
          </View>
        </>
      )}
    </Page>
  );
}

function SaveBar({ onSave, onCancel, disabled }: { onSave: () => Promise<void>; onCancel?: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View>
      <ErrorText>{error}</ErrorText>
      <Button
        title="Save changes"
        disabled={disabled}
        loading={busy}
        style={{ marginTop: 8 }}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave();
          } catch (e) {
            setError(e instanceof ApiError && e.status === 400 ? "Some answers look off. Check your numbers and try again." : (e as Error).message);
            setBusy(false);
          }
        }}
      />
      {onCancel && <Button title="Cancel" variant="outline" onPress={onCancel} style={{ marginTop: 8 }} />}
    </View>
  );
}

function BodyEditor({ profile, onSave }: { profile: Profile; onSave: (p: Partial<Profile>) => Promise<void> }) {
  const [sex, setSex] = useState<Sex>(profile.sex ?? "male");
  const [age, setAge] = useState(String(profile.age ?? ""));
  const [height, setHeight] = useState(String(profile.heightCm ?? ""));
  const [weight, setWeight] = useState(String(profile.weightKg ?? ""));
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel ?? "moderate");
  const [goal, setGoal] = useState<Goal>(profile.goal ?? "lose");
  const [pace, setPace] = useState<Pace>(closestPace(profile.goalRateKg));

  const a = num(age), h = num(height), w = num(weight);
  const valid = inRange(a, 13, 100) && inRange(h, 100, 250) && inRange(w, 30, 300);
  const rate = goal === "maintain" ? null : PACE[pace];
  const stats = valid ? { age: Math.round(a), heightCm: h, weightKg: w, sex, activityLevel: activity } : null;
  const preview = stats ? dailyTarget(stats, goal, rate) : null;
  const changes = stats && (profile.age !== stats.age || profile.heightCm !== h || profile.weightKg !== w || profile.sex !== sex || profile.activityLevel !== activity || profile.goal !== goal || (profile.goalRateKg ?? null) !== rate);

  return (
    <View style={{ gap: 14 }}>
      <View><Label>Sex</Label><Segmented<Sex> options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} value={sex} onChange={setSex} /></View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Label>Age</Label><Input value={age} onChangeText={setAge} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Label>Height cm</Label><Input value={height} onChangeText={setHeight} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Label>Weight kg</Label><Input value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
      </View>
      {!valid && <ErrorText>Age 13 to 100, height 100 to 250 cm, weight 30 to 300 kg.</ErrorText>}
      <View>
        <Label>Activity in a normal week</Label>
        <View style={{ gap: 8 }}>
          {ACTIVITY.map((o) => (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: activity === o.value }} onPress={() => setActivity(o.value)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, borderWidth: activity === o.value ? 2 : 1, borderColor: activity === o.value ? c.brand : c.line, backgroundColor: activity === o.value ? c.brandSoft : c.white }}>
              <Text style={{ fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View>
        <Label>Goal</Label>
        <Segmented<Goal> height={46} options={[{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build" }]} value={goal} onChange={setGoal} />
      </View>
      {goal !== "maintain" && (
        <View>
          <Label>Pace</Label>
          <Segmented<Pace> height={46} options={[{ value: "gentle", label: "Gentle" }, { value: "steady", label: "Steady" }, { value: "faster", label: "Faster" }]} value={pace} onChange={setPace} />
          <Muted style={{ fontSize: 13, marginTop: 6 }}>About {PACE[pace]} kg per week</Muted>
        </View>
      )}
      <View style={{ backgroundColor: c.surface, borderRadius: 14, padding: 14, gap: 4 }}>
        <Muted style={{ fontSize: 13 }}>{changes ? "New daily target" : "Current daily target"}</Muted>
        <Text style={{ fontSize: 24, fontWeight: "600", color: c.brand }}>{(changes ? preview : profile.calorieTarget)?.toLocaleString() ?? "–"} kcal</Text>
        {changes ? <Muted style={{ fontSize: 12 }}>Changing these answers recalculates your target and replaces earlier weigh-in adjustments.</Muted> : null}
      </View>
      <SaveBar disabled={!valid} onSave={() => onSave({ sex, age: Math.round(a), heightCm: h, weightKg: w, activityLevel: activity, goal, goalRateKg: rate })} />
    </View>
  );
}

function FoodEditor({ profile, onSave }: { profile: Profile; onSave: (p: Partial<Profile>) => Promise<void> }) {
  const [diet, setDiet] = useState<string | null>(profile.diet);
  const [allergies, setAllergies] = useState<string[]>(profile.allergies);
  return (
    <View style={{ gap: 14 }}>
      <View>
        <Label>Eating style</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="No restriction" selected={diet === null} onPress={() => setDiet(null)} />
          {Object.entries(DIETS).map(([k, label]) => <Chip key={k} label={label} selected={diet === k} onPress={() => setDiet(k)} />)}
        </View>
      </View>
      <View>
        <Label>Allergies</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(ALLERGENS).map(([k, label]) => <Chip key={k} variant="danger" label={label} selected={allergies.includes(k)} onPress={() => setAllergies(toggle(allergies, k))} />)}
        </View>
      </View>
      <Muted style={{ fontSize: 12 }}>These are safety rules. Meals that no longer fit are replaced in your plan. Your calorie target stays the same.</Muted>
      <SaveBar onSave={() => onSave({ diet, allergies })} />
    </View>
  );
}

function ChipEditor({ items, initial, onSave }: { items: Record<string, string>; initial: string[]; onSave: (v: string[]) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(initial);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(items).map(([k, label]) => <Chip key={k} label={label} selected={sel.includes(k)} onPress={() => setSel(toggle(sel, k))} />)}
      </View>
      <SaveBar onSave={() => onSave(sel)} />
    </View>
  );
}

function CuisineEditor({ initial, onSave }: { initial: string[]; onSave: (v: string[]) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(initial);
  return (
    <View style={{ gap: 14 }}>
      {CUISINE_GROUPS.map((g) => (
        <View key={g.name}>
          <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{g.name}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(g.items).map(([k, label]) => <Chip key={k} label={label} selected={sel.includes(k)} onPress={() => setSel(toggle(sel, k))} />)}
          </View>
        </View>
      ))}
      <SaveBar onSave={() => onSave(sel)} />
    </View>
  );
}

function PasswordEditor({ email, onDone }: { email: string; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const problem = next.length < 6 ? "The new password needs at least 6 characters." : next !== again ? "The new passwords don't match." : next === current ? "Pick a password different from the current one." : null;

  return (
    <View style={{ gap: 12 }}>
      <View><Label>Current password</Label><Input value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" /></View>
      <View><Label>New password</Label><Input value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" /></View>
      <View><Label>Repeat new password</Label><Input value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoComplete="new-password" /></View>
      {current && problem ? <ErrorText>{problem}</ErrorText> : null}
      <SaveBar
        disabled={!current || !!problem}
        onSave={async () => {
          // Check the current password first, so a stolen unlocked phone cannot change it silently.
          const check = await supabase.auth.signInWithPassword({ email, password: current });
          if (check.error) throw new Error("Your current password is wrong.");
          const res = await supabase.auth.updateUser({ password: next });
          if (res.error) throw new Error(res.error.message);
          onDone();
        }}
      />
    </View>
  );
}

function DeleteEditor() {
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/account", { method: "DELETE", json: { confirm: "DELETE", password } });
      await supabase.auth.signOut().catch(() => {}); // the login is gone; the root layout then shows the login screen
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "That password is wrong." : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Muted style={{ fontSize: 13, lineHeight: 20 }}>
        This permanently deletes your profile, plans, weigh-ins, logs, saved recipes and your login. It cannot be undone.
      </Muted>
      <View><Label>Your password</Label><Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" /></View>
      <View>
        <Label>Type DELETE to confirm</Label>
        <TextInput accessibilityLabel="Type DELETE to confirm" value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} style={{ height: 52, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 16, fontSize: 17 }} />
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Delete my account" disabled={!password || word !== "DELETE"} loading={busy} onPress={remove} style={{ backgroundColor: c.brandDark }} />
    </View>
  );
}
