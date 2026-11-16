// Shared vocabulary used by the dataset import and, later, onboarding + filters.
// Recipe.allergens / Recipe.diets / Recipe.equipment / cuisine tags all use these exact strings.

export const ALLERGENS = [
  "peanut", "tree-nut", "dairy", "egg", "gluten", "soy", "fish", "shellfish", "sesame",
] as const;

export const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free"] as const;

export const EQUIPMENT = [
  "oven", "stovetop", "microwave", "grill", "slow-cooker", "pressure-cooker",
  "blender", "food-processor", "air-fryer", "stand-mixer", "rice-cooker", "steamer",
] as const;

export const CUISINES = [
  "vietnamese", "dominican", "kazakh", "russian", "american", "italian", "french",
  "asian", "chinese", "japanese", "thai", "korean", "indian", "filipino", "indonesian",
  "malaysian", "caribbean", "cuban", "mexican", "greek", "spanish", "german", "middle-eastern",
] as const;

export type Allergen = (typeof ALLERGENS)[number];
export type Diet = (typeof DIETS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type Cuisine = (typeof CUISINES)[number];
