"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Chip, ErrorText, Input, Label, Segmented, Spinner, StepBar, cx } from "@/components/ui";
import { dailyTarget, tdee, type ActivityLevel, type Goal, type Sex } from "@/server/profile/calories";
import { ALLERGENS, CUISINES, DIETS, EQUIPMENT, type Allergen, type Cuisine, type Diet, type Equipment } from "@/server/db/vocab";

// ---------- labels for the backend's exact values (src/server/db/vocab.ts) ----------

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary: little or no exercise" },
  { value: "light", label: "Light: 1 to 2 days" },
  { value: "moderate", label: "Moderate: 3 to 5 days" },
  { value: "active", label: "Active: 6 to 7 days" },
  { value: "very_active", label: "Very active: hard daily training" },
];

const DIET_LABEL: Record<Diet, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-free",
  "dairy-free": "Dairy-free",
};

const ALLERGEN_LABEL: Record<Allergen, string> = {
  dairy: "Milk / dairy",
  egg: "Eggs",
  fish: "Fish",
  shellfish: "Shellfish",
  "tree-nut": "Tree nuts",
  peanut: "Peanuts",
  gluten: "Wheat / gluten",
  soy: "Soy",
  sesame: "Sesame",
};
// Order shown on screen (matches the mockup's order where possible).
const ALLERGEN_ORDER: Allergen[] = ["dairy", "egg", "fish", "shellfish", "tree-nut", "peanut", "gluten", "soy", "sesame"];

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  stovetop: "Stovetop",
  oven: "Oven",
  "air-fryer": "Air fryer",
  microwave: "Microwave",
  grill: "Grill",
  "slow-cooker": "Slow cooker",
  "pressure-cooker": "Pressure cooker",
  "rice-cooker": "Rice cooker",
  steamer: "Steamer",
  blender: "Blender",
  "food-processor": "Food processor",
  "stand-mixer": "Stand mixer",
};

const CUISINE_LABEL: Record<Cuisine, string> = {
  vietnamese: "Việt Nam", chinese: "Chinese", japanese: "Japanese", korean: "Korean", thai: "Thai",
  filipino: "Filipino", indonesian: "Indonesian", malaysian: "Malaysian", indian: "Indian",
  asian: "Pan-Asian", kazakh: "Kazakh", american: "American", mexican: "Mexican", caribbean: "Caribbean",
  cuban: "Cuban", dominican: "Dominican", italian: "Italian", french: "French", greek: "Greek",
  spanish: "Spanish", german: "German", russian: "Russian", "middle-eastern": "Middle Eastern",
};

const CUISINE_GROUPS: { name: string; items: Cuisine[] }[] = [
  { name: "Asian cuisine", items: ["chinese", "japanese", "korean", "vietnamese", "thai", "filipino", "indonesian", "malaysian", "indian", "kazakh", "asian"] },
  { name: "Americas", items: ["american", "mexican", "caribbean", "cuban", "dominican"] },
  { name: "European cuisine", items: ["italian", "french", "greek", "spanish", "german", "russian"] },
  { name: "Middle Eastern", items: ["middle-eastern"] },
];

const PACE = { gentle: 0.25, steady: 0.5, faster: 0.75 } as const;
type Pace = keyof typeof PACE;

// ---------- form state ----------

type Form = {
  sex: Sex;
  age: string;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel;
  goal: Goal;
  targetWeight: string; // shown only; the backend doesn't store it
  targetUnit: "kg" | "lb";
  pace: Pace;
  diet: Diet | null;
  allergies: Allergen[];
  equipment: Equipment[];
  cuisines: Cuisine[];
};

const EMPTY: Form = {
  sex: "male",
  age: "",
  heightCm: "",
  weightKg: "",
  activityLevel: "moderate",
  goal: "lose",
  targetWeight: "",
  targetUnit: "kg",
  pace: "steady",
  diet: null,
  allergies: [],
  equipment: [],
  cuisines: [],
};

type SavedProfile = {
  heightCm: number | null; weightKg: number | null; age: number | null; sex: Sex | null;
  activityLevel: ActivityLevel | null; goal: Goal | null; goalRateKg: number | null;
  cuisines: string[]; diet: string | null; allergies: string[]; equipment: string[];
} | null;

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const closestPace = (rate: number | null): Pace =>
  rate == null ? "steady" : (Object.entries(PACE).sort((a, b) => Math.abs(a[1] - rate) - Math.abs(b[1] - rate))[0][0] as Pace);

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  // Each step starts at the top instead of keeping the previous step's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  const [f, setF] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | "profile" | "plan">(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }));

  // Pre-fill when the user already has a profile (editing their answers).
  useEffect(() => {
    api<{ profile: SavedProfile }>("/api/profile")
      .then(({ profile: p }) => {
        if (!p) return;
        setF((cur) => ({
          ...cur,
          sex: p.sex ?? cur.sex,
          age: p.age?.toString() ?? "",
          heightCm: p.heightCm?.toString() ?? "",
          weightKg: p.weightKg?.toString() ?? "",
          activityLevel: p.activityLevel ?? cur.activityLevel,
          goal: p.goal ?? cur.goal,
          pace: closestPace(p.goalRateKg),
          diet: (DIETS as readonly string[]).includes(p.diet ?? "") ? (p.diet as Diet) : null,
          allergies: p.allergies.filter((a): a is Allergen => (ALLERGENS as readonly string[]).includes(a)),
          equipment: p.equipment.filter((e): e is Equipment => (EQUIPMENT as readonly string[]).includes(e)),
          cuisines: p.cuisines.filter((c): c is Cuisine => (CUISINES as readonly string[]).includes(c)),
        }));
      })
      .catch(() => {}) // first-time users have no profile; nothing to pre-fill
      .finally(() => setLoading(false));
  }, []);

  const age = num(f.age), heightCm = num(f.heightCm), weightKg = num(f.weightKg);
  const bodyErrors = {
    age: f.age && !inRange(age, 13, 100) ? "Age must be 13 to 100." : null,
    heightCm: f.heightCm && !inRange(heightCm, 100, 250) ? "Height must be 100 to 250 cm." : null,
    weightKg: f.weightKg && !inRange(weightKg, 30, 300) ? "Weight must be 30 to 300 kg." : null,
  };
  const bodyValid = inRange(age, 13, 100) && inRange(heightCm, 100, 250) && inRange(weightKg, 30, 300);

  const stats = bodyValid
    ? { age: Math.round(age), heightCm, weightKg, sex: f.sex, activityLevel: f.activityLevel }
    : null;
  const goalRateKg = f.goal === "maintain" ? null : PACE[f.pace];
  // Same functions the backend uses, so the preview matches what gets saved.
  const maintenance = stats ? Math.round(tdee(stats)) : null;
  const target = stats ? dailyTarget(stats, f.goal, goalRateKg) : null;

  const targetKg = useMemo(() => {
    const t = num(f.targetWeight);
    if (!Number.isFinite(t)) return null;
    return f.targetUnit === "kg" ? t : t / 2.2046;
  }, [f.targetWeight, f.targetUnit]);
  const weeksToTarget =
    targetKg && bodyValid && goalRateKg ? Math.ceil(Math.abs(weightKg - targetKg) / goalRateKg) : null;
  const targetHint =
    targetKg == null || !bodyValid
      ? null
      : f.goal === "lose" && targetKg >= weightKg
      ? "Your target is above your current weight."
      : f.goal === "gain" && targetKg <= weightKg
      ? "Your target is below your current weight."
      : weeksToTarget
      ? `About ${weeksToTarget} weeks at this pace.`
      : null;

  async function finish() {
    if (!stats) return;
    setError(null);
    setSaving("profile");
    try {
      await api("/api/profile", {
        method: "PUT",
        json: {
          ...stats,
          goal: f.goal,
          goalRateKg,
          diet: f.diet,
          allergies: f.allergies,
          equipment: f.equipment,
          cuisines: f.cuisines,
        },
      });
      setSaving("plan");
      try {
        // Build this week's plan so Today has something to show. Returns the existing plan if there is one.
        await api("/api/plan", { method: "POST", json: {} });
      } catch {
        // Not fatal: Today can create the plan later.
      }
      window.location.assign("/today");
    } catch (e) {
      setSaving(null);
      setError(e instanceof ApiError && e.status === 400 ? "Some answers look off. Check your numbers and try again." : (e as Error).message);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner />
      </main>
    );
  }

  const back = step > 1 ? () => setStep(step - 1) : undefined;

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-6">
      <StepBar step={step} total={4} onBack={back} />

      {step === 1 && (
        <>
          <Heading title="Let's size your daily calories" sub="We use these once to set a starting target, then adjust it from your weekly weigh-ins." />
          <Label>Sex</Label>
          <Segmented<Sex>
            options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
            value={f.sex}
            onChange={(sex) => set({ sex })}
          />
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="age">Age</Label>
              <Input id="age" type="number" inputMode="numeric" placeholder="28" value={f.age} onChange={(e) => set({ age: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="height">Height cm</Label>
              <Input id="height" type="number" inputMode="decimal" placeholder="178" value={f.heightCm} onChange={(e) => set({ heightCm: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="weight">Weight kg</Label>
              <Input id="weight" type="number" inputMode="decimal" placeholder="82" value={f.weightKg} onChange={(e) => set({ weightKg: e.target.value })} />
            </div>
          </div>
          <ErrorText>{bodyErrors.age ?? bodyErrors.heightCm ?? bodyErrors.weightKg}</ErrorText>

          <div className="mt-5">
            <Label htmlFor="activity">Activity in a normal week</Label>
            <div className="relative">
              <select
                id="activity"
                value={f.activityLevel}
                onChange={(e) => set({ activityLevel: e.target.value as ActivityLevel })}
                className="h-12 w-full appearance-none rounded-lg border border-line bg-white px-3 pr-8 text-[15px] outline-none focus:border-ink"
              >
                {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">⌄</span>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-surface p-4">
            <p className="mb-1 text-[13px] text-ink-muted">Estimated maintenance</p>
            <p>
              <span className="text-[32px] font-bold text-brand">{maintenance?.toLocaleString() ?? "—"}</span>
              <span className="text-[15px] text-ink-muted"> kcal / day</span>
            </p>
          </div>

          <Footer><Button disabled={!bodyValid} onClick={() => setStep(2)}>Continue</Button></Footer>
        </>
      )}

      {step === 2 && (
        <>
          <Heading title="What's your goal?" sub="Your daily calories start here!" />
          {([
            ["lose", "Lose weight", "Eat a little under maintenance"],
            ["maintain", "Maintain weight", "Stay where you are"],
            ["gain", "Build muscle", "Eat a little over maintenance"],
          ] as [Goal, string, string][]).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => set({ goal: value })}
              className={cx(
                "mb-3 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition",
                f.goal === value ? "border-[1.5px] border-brand bg-[#FFF8F8]" : "border-line hover:border-ink",
              )}
            >
              <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border-2", f.goal === value ? "border-brand" : "border-line")}>
                {f.goal === value ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{title}</span>
                <span className="block text-[13px] text-ink-muted">{desc}</span>
              </span>
            </button>
          ))}

          {f.goal !== "maintain" && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <Label htmlFor="target">Target weight <span className="font-normal text-ink-muted">(optional)</span></Label>
                <div className="w-24">
                  <Segmented<"kg" | "lb">
                    size="sm"
                    options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
                    value={f.targetUnit}
                    onChange={(targetUnit) => set({ targetUnit })}
                  />
                </div>
              </div>
              <Input id="target" type="number" inputMode="decimal" value={f.targetWeight} onChange={(e) => set({ targetWeight: e.target.value })} suffix={f.targetUnit} />
              {targetHint ? <p className="mt-2 text-[13px] text-ink-muted">{targetHint}</p> : null}

              <div className="mt-5">
                <Label>Pace</Label>
                <Segmented<Pace>
                  options={[{ value: "gentle", label: "Gentle" }, { value: "steady", label: "Steady" }, { value: "faster", label: "Faster" }]}
                  value={f.pace}
                  onChange={(pace) => set({ pace })}
                />
                <p className="mt-2 text-[13px] text-ink-muted">
                  About {f.targetUnit === "kg" ? `${PACE[f.pace]} kg` : `${(PACE[f.pace] * 2.2).toFixed(1)} lb`} per week
                </p>
              </div>
            </>
          )}

          <div className="mt-6 flex items-center justify-between">
            <span className="text-[15px]">Your starting target</span>
            <span className="text-[22px] font-bold text-brand">{target?.toLocaleString() ?? "—"} kcal</span>
          </div>
          <p className="mt-1 text-[13px] text-ink-muted">We never go below a safe calorie floor, whatever pace you pick.</p>

          <Footer><Button onClick={() => setStep(3)}>Continue</Button></Footer>
        </>
      )}

      {step === 3 && (
        <>
          <Heading title="What should we always respect?" sub="Recipes that break these rules are removed before anything is ranked." />
          <Label>Eating style</Label>
          <div className="flex flex-wrap gap-2">
            <Chip label="No restriction" selected={f.diet === null} onClick={() => set({ diet: null })} />
            {DIETS.map((d) => (
              <Chip key={d} label={DIET_LABEL[d]} selected={f.diet === d} onClick={() => set({ diet: d })} />
            ))}
          </div>

          <div className="mt-6">
            <Label>Allergies</Label>
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_ORDER.map((a) => (
                <Chip key={a} variant="danger" label={ALLERGEN_LABEL[a]} selected={f.allergies.includes(a)} onClick={() => set({ allergies: toggle(f.allergies, a) })} />
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-surface p-4 text-[13px] leading-relaxed text-ink-muted">
            Allergies are checked again after the AI picks a recipe, so a mistake can never put an allergen on your plan.
          </div>

          <Footer><Button onClick={() => setStep(4)}>Continue</Button></Footer>
        </>
      )}

      {step === 4 && (
        <>
          <Heading title="What's in your kitchen?" sub="Recipes that need a tool you don't have stay available. You can convert the steps on the recipe page." />
          <Section title="Your equipment" summary={summary(f.equipment.map((e) => EQUIPMENT_LABEL[e]))}>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((e) => (
                <Chip key={e} label={EQUIPMENT_LABEL[e]} selected={f.equipment.includes(e)} onClick={() => set({ equipment: toggle(f.equipment, e) })} />
              ))}
            </div>
          </Section>

          <Section title="Cuisines you like" summary={summary(f.cuisines.map((c) => CUISINE_LABEL[c]))} defaultOpen>
            {CUISINE_GROUPS.map((g) => (
              <div key={g.name} className="mb-4">
                <p className="mb-2 text-[13px] font-semibold">{g.name}</p>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((c) => (
                    <Chip key={c} label={CUISINE_LABEL[c]} selected={f.cuisines.includes(c)} onClick={() => set({ cuisines: toggle(f.cuisines, c) })} />
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <p className="mt-4 text-[13px] text-ink-muted">These are only a starting point. The planner learns from what you keep, swap and skip.</p>
          <ErrorText>{error}</ErrorText>

          <Footer>
            <Button loading={saving !== null} onClick={finish}>Start my plan</Button>
            {saving === "plan" ? <p className="mt-2 text-center text-[13px] text-ink-muted">Building your week…</p> : null}
          </Footer>
        </>
      )}
    </main>
  );
}

// ---------- small pieces ----------

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1 className="mb-2 text-[26px] font-bold leading-tight">{title}</h1>
      <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">{sub}</p>
    </>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 mt-auto bg-white pb-1 pt-6">{children}</div>;
}

const summary = (labels: string[]) =>
  labels.length === 0 ? "None selected" : `${labels.length} selected: ${labels.join(", ")}`;

function Section({ title, summary, defaultOpen, children }: { title: string; summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center py-3 text-left" aria-expanded={open}>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block text-[12px] text-ink-muted">{summary}</span>
        </span>
        <span className="text-lg">{open ? "⌃" : "⌄"}</span>
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </div>
  );
}
