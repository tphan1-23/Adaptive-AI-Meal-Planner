"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/api-types";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { ACTIVITY, ALLERGENS, CUISINE_GROUPS, DIETS, EQUIPMENT, PACE, closestPace, niceName, toggle, type Pace } from "@/lib/vocab";
import { dailyTarget, type ActivityLevel, type Goal, type Sex } from "@/server/profile/calories";
import { BottomNav, Button, Chip, ErrorText, Input, Label, Segmented, Spinner, cx } from "@/components/ui";

type Section = "body" | "food" | "kitchen" | "tastes" | "password" | "delete" | null;
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

export default function SettingsPage() {
  const [email, setEmail] = useState("");
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
  useEffect(() => {
    load();
    createSupabaseBrowser().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")).catch(() => {});
  }, [load]);

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
    <div className="flex flex-col gap-3 rounded-[20px] border border-line p-4">
      <button type="button" aria-expanded={open === key} onClick={() => { setOpen(open === key ? null : key); setNotice(null); }} className="flex min-h-[44px] items-center gap-3 text-left">
        <span className="flex-1">
          <span className="block text-[16px] font-semibold">{title}</span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">{summary}</span>
        </span>
        <span className="font-semibold text-brand">{open === key ? "Close" : "Edit"}</span>
      </button>
      {open === key && body}
    </div>
  );

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-14">
        <div>
          <h1 className="mb-1.5 text-[34px] font-semibold leading-none tracking-tight">Settings</h1>
          <p className="text-[14px] text-ink-muted">{email}</p>
        </div>
        <ErrorText>{error}</ErrorText>
        {!profile && !error && <div className="flex justify-center py-10"><Spinner /></div>}
        {notice && <div className="rounded-[14px] bg-surface p-3.5 text-[14px]">{notice}</div>}

        {profile && (
          <>
            <h2 className="text-[17px] font-semibold">Your plan</h2>
            {row("body", "Body and goal", `${profile.heightCm ?? "?"} cm · ${profile.weightKg ?? "?"} kg · ${profile.age ?? "?"} y · goal: ${profile.goal ?? "?"} · target ${profile.calorieTarget.toLocaleString()} kcal`, <BodyEditor profile={profile} onSave={saveProfile} />)}
            {row("food", "Eating style and allergies", `${profile.diet ? niceName(profile.diet) : "No restriction"} · ${profile.allergies.length ? profile.allergies.map(niceName).join(", ") : "no allergies"}`, <FoodEditor profile={profile} onSave={saveProfile} />)}
            {row("kitchen", "Kitchen equipment", profile.equipment.length ? profile.equipment.map(niceName).join(", ") : "None selected", <ChipEditor items={EQUIPMENT} initial={profile.equipment} onSave={(equipment) => saveProfile({ equipment })} />)}
            {row("tastes", "Cuisines you like", profile.cuisines.length ? profile.cuisines.map(niceName).join(", ") : "None selected", <CuisineEditor initial={profile.cuisines} onSave={(cuisines) => saveProfile({ cuisines })} />)}

            <h2 className="text-[17px] font-semibold">Account</h2>
            {row("password", "Change password", "Needs your current password", <PasswordEditor email={email} onDone={() => { setOpen(null); setNotice("Password changed."); }} />)}
            <Button variant="outline" onClick={async () => { await createSupabaseBrowser().auth.signOut(); window.location.assign("/login"); }}>Sign out</Button>
            {row("delete", "Delete account", "Permanently removes your data and login", <DeleteEditor />)}

            <h2 className="text-[17px] font-semibold">About</h2>
            <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-muted">
              <p>This app gives general meal ideas and calorie estimates. It is not medical advice. Talk to a doctor or dietitian about your health, allergies and weight goals.</p>
              <p>Recipes come from the Food.com dataset and nutrition from USDA data. Dish photos are from Wikipedia / Wikimedia Commons, each under its own free license.</p>
              <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer" className="font-semibold text-brand">About Wikimedia Commons</a>
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}

function SaveBar({ onSave, disabled }: { onSave: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <ErrorText>{error}</ErrorText>
      <Button
        className="mt-2"
        disabled={disabled}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave();
          } catch (e) {
            setError(e instanceof ApiError && e.status === 400 ? "Some answers look off. Check your numbers and try again." : (e as Error).message);
            setBusy(false);
          }
        }}
      >
        Save changes
      </Button>
    </div>
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
    <div className="flex flex-col gap-3.5">
      <div><Label>Sex</Label><Segmented<Sex> options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} value={sex} onChange={setSex} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label htmlFor="s-age">Age</Label><Input id="s-age" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></div>
        <div><Label htmlFor="s-h">Height cm</Label><Input id="s-h" type="number" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
        <div><Label htmlFor="s-w">Weight kg</Label><Input id="s-w" type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
      </div>
      {!valid && <ErrorText>Age 13 to 100, height 100 to 250 cm, weight 30 to 300 kg.</ErrorText>}
      <div>
        <Label>Activity in a normal week</Label>
        <div className="flex flex-col gap-2">
          {ACTIVITY.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={activity === o.value} onClick={() => setActivity(o.value)} className={cx("min-h-[44px] rounded-xl border px-3.5 text-left text-[14px]", activity === o.value ? "border-2 border-brand bg-brand-soft" : "border-line bg-white")}>{o.label}</button>
          ))}
        </div>
      </div>
      <div><Label>Goal</Label><Segmented<Goal> options={[{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build" }]} value={goal} onChange={setGoal} /></div>
      {goal !== "maintain" && (
        <div>
          <Label>Pace</Label>
          <Segmented<Pace> options={[{ value: "gentle", label: "Gentle" }, { value: "steady", label: "Steady" }, { value: "faster", label: "Faster" }]} value={pace} onChange={setPace} />
          <p className="mt-1.5 text-[13px] text-ink-muted">About {PACE[pace]} kg per week</p>
        </div>
      )}
      <div className="rounded-[14px] bg-surface p-3.5">
        <div className="text-[13px] text-ink-muted">{changes ? "New daily target" : "Current daily target"}</div>
        <div className="text-[24px] font-semibold text-brand">{(changes ? preview : profile.calorieTarget)?.toLocaleString() ?? "–"} kcal</div>
        {changes ? <p className="text-[12px] text-ink-muted">Changing these answers recalculates your target and replaces earlier weigh-in adjustments.</p> : null}
      </div>
      <SaveBar disabled={!valid} onSave={() => onSave({ sex, age: Math.round(a), heightCm: h, weightKg: w, activityLevel: activity, goal, goalRateKg: rate })} />
    </div>
  );
}

function FoodEditor({ profile, onSave }: { profile: Profile; onSave: (p: Partial<Profile>) => Promise<void> }) {
  const [diet, setDiet] = useState<string | null>(profile.diet);
  const [allergies, setAllergies] = useState<string[]>(profile.allergies);
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Label>Eating style</Label>
        <div className="flex flex-wrap gap-2">
          <Chip label="No restriction" selected={diet === null} onClick={() => setDiet(null)} />
          {Object.entries(DIETS).map(([k, label]) => <Chip key={k} label={label} selected={diet === k} onClick={() => setDiet(k)} />)}
        </div>
      </div>
      <div>
        <Label>Allergies</Label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ALLERGENS).map(([k, label]) => <Chip key={k} variant="danger" label={label} selected={allergies.includes(k)} onClick={() => setAllergies(toggle(allergies, k))} />)}
        </div>
      </div>
      <p className="text-[12px] text-ink-muted">These are safety rules. Meals that no longer fit are replaced in your plan. Your calorie target stays the same.</p>
      <SaveBar onSave={() => onSave({ diet, allergies })} />
    </div>
  );
}

function ChipEditor({ items, initial, onSave }: { items: Record<string, string>; initial: string[]; onSave: (v: string[]) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(initial);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-2">{Object.entries(items).map(([k, label]) => <Chip key={k} label={label} selected={sel.includes(k)} onClick={() => setSel(toggle(sel, k))} />)}</div>
      <SaveBar onSave={() => onSave(sel)} />
    </div>
  );
}

function CuisineEditor({ initial, onSave }: { initial: string[]; onSave: (v: string[]) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(initial);
  return (
    <div className="flex flex-col gap-3.5">
      {CUISINE_GROUPS.map((g) => (
        <div key={g.name}>
          <p className="mb-2 text-[13px] font-semibold">{g.name}</p>
          <div className="flex flex-wrap gap-2">{Object.entries(g.items).map(([k, label]) => <Chip key={k} label={label} selected={sel.includes(k)} onClick={() => setSel(toggle(sel, k))} />)}</div>
        </div>
      ))}
      <SaveBar onSave={() => onSave(sel)} />
    </div>
  );
}

function PasswordEditor({ email, onDone }: { email: string; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const problem = next.length < 6 ? "The new password needs at least 6 characters." : next !== again ? "The new passwords don't match." : next === current ? "Pick a password different from the current one." : null;
  return (
    <div className="flex flex-col gap-3">
      <div><Label htmlFor="pw0">Current password</Label><Input id="pw0" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div><Label htmlFor="pw1">New password</Label><Input id="pw1" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div><Label htmlFor="pw2">Repeat new password</Label><Input id="pw2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div>
      {current && problem ? <ErrorText>{problem}</ErrorText> : null}
      <SaveBar
        disabled={!current || !!problem}
        onSave={async () => {
          const supabase = createSupabaseBrowser();
          // Check the current password first, so someone at an unlocked screen cannot change it silently.
          const check = await supabase.auth.signInWithPassword({ email, password: current });
          if (check.error) throw new Error("Your current password is wrong.");
          const res = await supabase.auth.updateUser({ password: next });
          if (res.error) throw new Error(res.error.message);
          onDone();
        }}
      />
    </div>
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
      await createSupabaseBrowser().auth.signOut().catch(() => {}); // the login is gone
      window.location.assign("/login");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "That password is wrong." : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-muted">This permanently deletes your profile, plans, weigh-ins, logs, saved recipes and your login. It cannot be undone.</p>
      <div><Label htmlFor="dpw">Your password</Label><Input id="dpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div><Label htmlFor="dword">Type DELETE to confirm</Label><Input id="dword" value={word} autoCapitalize="characters" onChange={(e) => setWord(e.target.value)} /></div>
      <ErrorText>{error}</ErrorText>
      <Button disabled={!password || word !== "DELETE"} loading={busy} onClick={remove} className="bg-brand-dark hover:bg-brand-dark">Delete my account</Button>
    </div>
  );
}
