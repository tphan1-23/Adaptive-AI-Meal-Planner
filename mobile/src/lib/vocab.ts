// Exact values the API accepts (src/server/db/vocab.ts), with the labels the app shows.
import type { ActivityLevel } from "./calories";

export const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary: little or no exercise" },
  { value: "light", label: "Light: 1 to 2 days" },
  { value: "moderate", label: "Moderate: 3 to 5 days" },
  { value: "active", label: "Active: 6 to 7 days" },
  { value: "very_active", label: "Very active: hard daily training" },
];

export const DIETS = { vegetarian: "Vegetarian", vegan: "Vegan", "gluten-free": "Gluten-free", "dairy-free": "Dairy-free" } as const;

export const ALLERGENS = {
  dairy: "Milk / dairy", egg: "Eggs", fish: "Fish", shellfish: "Shellfish", "tree-nut": "Tree nuts",
  peanut: "Peanuts", gluten: "Wheat / gluten", soy: "Soy", sesame: "Sesame",
} as const;

export const EQUIPMENT = {
  stovetop: "Stovetop", oven: "Oven", "air-fryer": "Air fryer", microwave: "Microwave", grill: "Grill",
  "slow-cooker": "Slow cooker", "pressure-cooker": "Pressure cooker", "rice-cooker": "Rice cooker",
  steamer: "Steamer", blender: "Blender", "food-processor": "Food processor", "stand-mixer": "Stand mixer",
} as const;

export const CUISINE_GROUPS: { name: string; items: Record<string, string> }[] = [
  { name: "Asian cuisine", items: { chinese: "Chinese", japanese: "Japanese", korean: "Korean", vietnamese: "Việt Nam", thai: "Thai", filipino: "Filipino", indonesian: "Indonesian", malaysian: "Malaysian", indian: "Indian", kazakh: "Kazakh", asian: "Pan-Asian" } },
  { name: "Americas", items: { american: "American", mexican: "Mexican", caribbean: "Caribbean", cuban: "Cuban", dominican: "Dominican" } },
  { name: "European cuisine", items: { italian: "Italian", french: "French", greek: "Greek", spanish: "Spanish", german: "German", russian: "Russian" } },
  { name: "Middle Eastern", items: { "middle-eastern": "Middle Eastern" } },
];

export const PACE = { gentle: 0.25, steady: 0.5, faster: 0.75 } as const;
export type Pace = keyof typeof PACE;
export const closestPace = (rate: number | null | undefined): Pace =>
  rate == null ? "steady" : (Object.entries(PACE).sort((a, b) => Math.abs(a[1] - rate) - Math.abs(b[1] - rate))[0][0] as Pace);

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealTypeName = (typeof MEAL_TYPES)[number];

export const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const niceName = (s: string) => cap(s.replace(/-/g, " "));
