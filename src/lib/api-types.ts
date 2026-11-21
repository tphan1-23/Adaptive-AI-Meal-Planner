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
  weightKg: number;
  goal: "lose" | "maintain" | "gain";
  diet: string | null;
  allergies: string[];
  equipment: string[];
  calorieTarget: number;
};

export type WeighIn = { id: string; weightKg: number; loggedAt: string };

export type MealLog = {
  id: string;
  entryId: string | null;
  status: "eaten_as_planned" | "skipped" | "modified" | "ad_hoc";
  calories: number;
  date: string;
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
