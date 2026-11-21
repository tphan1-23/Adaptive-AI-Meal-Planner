// Response shapes of our own /api routes (see docs/api.md). Keep in step with that file.
export type EntryRecipe = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tags: string[];
  equipment: string[];
  /** A photo of the dish, or null when none matches (clients then show an illustration). */
  imageUrl: string | null;
};

export type Entry = {
  id: string;
  date: string;
  mealType: string;
  position: number;
  recipe: EntryRecipe;
  converted: boolean;
  modified: boolean;
};

export type Plan = { id: string; weekStart: string; calorieTarget: number; entries: Entry[] };

export type Profile = {
  id: string;
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: "male" | "female" | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  goal: "lose" | "maintain" | "gain" | null;
  goalRateKg: number | null;
  cuisines: string[];
  diet: string | null;
  allergies: string[];
  equipment: string[];
  calorieTarget: number;
};

export type WeighIn = { id: string; weightKg: number; loggedAt: string };

export type MealLog = {
  id: string;
  entryId: string | null;
  mealType?: string;
  status: "eaten_as_planned" | "skipped" | "modified" | "ad_hoc";
  recipe?: { id: string; name: string } | null;
  calories: number;
  note?: string | null;
  date: string;
};

export type SavedRecipe = {
  id: string;
  name: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tags: string[];
  imageUrl: string | null;
  savedAt: string;
};

export type AdherenceSummary = {
  plannedMeals: number;
  loggedPlannedMeals: number;
  eatenAsPlanned: number;
  modified: number;
  skipped: number;
  adHoc: number;
  followedRate: number | null;
};

export type AdherenceDay = AdherenceSummary & {
  date: string;
  plannedCalories: number;
  actualCalories: number;
};

export type Adherence = {
  from: string;
  to: string;
  totals: AdherenceSummary;
  days: AdherenceDay[];
};
