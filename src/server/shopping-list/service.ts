import { z } from "zod";
import { prisma } from "../db/prisma";
import { aggregateIngredients, type IngredientLine, type MealIngredients } from "./aggregate";
import { AISLE_ORDER } from "./tidy";

const ingredientLine = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().catch(1),
  unit: z.string().catch("item"),
});

/** Json column -> clean ingredient lines. Invalid lines are skipped, never trusted blindly. */
function parseIngredients(json: unknown): IngredientLine[] {
  if (!Array.isArray(json)) return [];
  const out: IngredientLine[] = [];
  for (const raw of json) {
    const r = ingredientLine.safeParse(raw);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** The ingredients a user actually needs for a meal: their AI-modified version if any, else the recipe's. */
function mealIngredients(entry: { id: string; date: Date; modifiedRecipe: unknown; recipe: { name: string; ingredients: unknown } }): MealIngredients {
  const modified = (entry.modifiedRecipe as { ingredients?: unknown } | null)?.ingredients;
  const lines = parseIngredients(modified);
  const name = (entry.modifiedRecipe as { name?: unknown } | null)?.name;
  return {
    mealId: entry.id,
    recipe: typeof name === "string" && name ? name : entry.recipe.name,
    date: entry.date.toISOString().slice(0, 10),
    ingredients: lines.length ? lines : parseIngredients(entry.recipe.ingredients),
  };
}

export const WEEK_START = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build (or refresh) the shopping list for one of the user's weekly plans.
 * Items already ticked off stay ticked. Returns null if the user has no such plan.
 */
export async function getShoppingList(userId: string, weekStart?: string) {
  const plan = await prisma.weeklyPlan.findFirst({
    where: { userId, ...(weekStart ? { weekStart: new Date(`${weekStart}T00:00:00Z`) } : {}) },
    orderBy: { weekStart: "desc" },
    include: { entries: { include: { recipe: { select: { name: true, ingredients: true } } } } },
  });
  if (!plan) return null;

  const items = aggregateIngredients(plan.entries.map(mealIngredients));

  const existing = await prisma.shoppingListItem.findMany({ where: { planId: plan.id } });
  const checkedKeys = new Set(existing.filter((i) => i.checked).map((i) => `${i.name}|${i.unit}`));

  await prisma.$transaction([
    prisma.shoppingListItem.deleteMany({ where: { planId: plan.id } }),
    prisma.shoppingListItem.createMany({
      data: items.map((i) => ({
        planId: plan.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        checked: checkedKeys.has(`${i.name}|${i.unit}`),
      })),
    }),
  ]);

  const saved = await prisma.shoppingListItem.findMany({ where: { planId: plan.id }, orderBy: { name: "asc" } });
  const meta = new Map(items.map((i) => [`${i.name}|${i.unit}`, i]));
  return {
    planId: plan.id,
    weekStart: plan.weekStart,
    items: saved
      .map((i) => {
        const m = meta.get(`${i.name}|${i.unit}`);
        return { ...i, mealCount: m?.mealCount ?? 1, aisle: m?.aisle ?? "other", staple: m?.staple ?? false, usedIn: m?.usedIn ?? [] };
      })
      .sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name)),
  };
}

/** Tick or untick an item. Only works on items belonging to the caller's own plans. */
export async function setItemChecked(userId: string, itemId: string, checked: boolean) {
  const res = await prisma.shoppingListItem.updateMany({
    where: { id: itemId, plan: { userId } },
    data: { checked },
  });
  return res.count > 0;
}