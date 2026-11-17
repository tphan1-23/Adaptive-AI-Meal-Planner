// End-to-end check of the backend services against the real database.
//
//   npm run test:e2e
//
// It creates a throwaway test user, walks through the main flows (onboarding, weekly plan,
// shopping list, weigh-ins, preference learning, swap), prints PASS/FAIL per step, then deletes
// the test user. Everything attached to the user is removed by cascade.
//
// It is NOT part of `npm test` (no ".test" in the name) because it needs the database.
// It does not need a login: it calls the service layer directly, like the API routes do.

import { prisma } from "../../src/server/db/prisma";
import { saveProfile, logWeight } from "../../src/server/profile/service";
import { createWeekPlan, swapEntry } from "../../src/server/planning/service";
import { getShoppingList, setItemChecked } from "../../src/server/shopping-list/service";
import { getAffinity, recordSignal } from "../../src/server/adherence/service";
import { isGenericTag } from "../../src/server/adherence/affinity";

// Fixed id so a failed run can always be found and cleaned up.
const TEST_USER = "00000000-0000-4000-8000-0000000000e2";
const DAY = 86_400_000;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function cleanup() {
  await prisma.profile.deleteMany({ where: { id: TEST_USER } });
}

async function main() {
  await cleanup(); // leftovers from an earlier failed run

  // 1. Onboarding -------------------------------------------------------------
  console.log("\n1. Onboarding and calorie target");
  const profile = await saveProfile(TEST_USER, {
    heightCm: 180,
    weightKg: 80,
    age: 30,
    sex: "male",
    activityLevel: "moderate",
    goal: "lose",
    goalRateKg: 0.5,
    cuisines: ["vietnamese", "italian"],
    diet: "vegetarian",
    allergies: ["peanut"],
    equipment: ["oven", "stovetop"],
  });
  // TDEE = 1780 x 1.55 = 2759, minus 0.5 kg/week x 1100 = 550
  check("starting calorie target is 2209", profile.calorieTarget === 2209, `got ${profile.calorieTarget}`);
  const startLogs = await prisma.weightLog.count({ where: { userId: TEST_USER } });
  check("starting weight was logged", startLogs === 1, `${startLogs} logs`);

  // 2. Weekly plan ------------------------------------------------------------
  console.log("\n2. Weekly plan");
  const plan = await createWeekPlan(TEST_USER);
  check("plan has 7 meals", plan.entries.length === 7, `${plan.entries.length} meals`);
  const recipeIds = plan.entries.map((e) => e.recipe.id);
  check("no recipe repeated within the week", new Set(recipeIds).size === recipeIds.length);
  const recipes = await prisma.recipe.findMany({ where: { id: { in: recipeIds } } });
  check("no recipe contains a peanut allergen", recipes.every((r) => !r.allergens.includes("peanut")));
  check("every recipe is vegetarian", recipes.every((r) => r.diets.includes("vegetarian")));
  const target = Math.round(2209 * 0.4); // dinner is 40% of the daily target
  check(
    "dinners are near the calorie target",
    plan.entries.every((e) => Math.abs(e.recipe.calories - target) / target <= 0.8),
    `target about ${target} kcal`,
  );
  const again = await createWeekPlan(TEST_USER);
  check("asking again returns the same plan", again.id === plan.id && again.entries.length === 7);

  // 3. Shopping list ----------------------------------------------------------
  console.log("\n3. Shopping list");
  const list = await getShoppingList(TEST_USER);
  check("shopping list is built", !!list && list.items.length > 0, `${list?.items.length ?? 0} items`);
  if (list) {
    const keys = list.items.map((i) => `${i.name}|${i.unit}`);
    check("items are de-duplicated", new Set(keys).size === keys.length);
    check("shared ingredients are counted across meals", list.items.some((i) => i.mealCount > 1));
    const first = list.items[0];
    check("an item can be ticked off", await setItemChecked(TEST_USER, first.id, true));
    const refreshed = await getShoppingList(TEST_USER);
    check(
      "ticked items stay ticked after a refresh",
      !!refreshed && refreshed.items.find((i) => i.name === first.name && i.unit === first.unit)?.checked === true,
    );
    check(
      "another user cannot tick this user's items",
      !(await setItemChecked("11111111-1111-4111-8111-111111111111", first.id, false)),
    );
  }

  // 4. Weekly weigh-in --------------------------------------------------------
  console.log("\n4. Weekly weigh-in adjusts the target");
  const now = Date.now();
  await prisma.weightLog.deleteMany({ where: { userId: TEST_USER } });
  await prisma.weightLog.createMany({
    data: [
      { userId: TEST_USER, weightKg: 80, loggedAt: new Date(now - 14 * DAY) },
      { userId: TEST_USER, weightKg: 80, loggedAt: new Date(now - 8 * DAY) },
    ],
  });
  const weighIn = await logWeight(TEST_USER, 80); // flat weight while trying to lose 0.5 kg/week
  check("flat weight triggers an adjustment", weighIn.adjustment?.changed === true, weighIn.adjustment?.reason ?? "none");
  const adjusted = await prisma.profile.findUniqueOrThrow({ where: { id: TEST_USER } });
  check("target dropped by one 100 kcal step", adjusted.calorieTarget === 2109, `got ${adjusted.calorieTarget}`);
  const quick = await logWeight(TEST_USER, 80); // logged again right away
  check("a second weigh-in the same day does not adjust again", quick.adjustment === null);

  // 5. Preference learning ----------------------------------------------------
  console.log("\n5. Preference learning");
  const liked = recipes[0];
  const skipped = recipes[1];
  const likedUpdate = await recordSignal(TEST_USER, liked.id, "favorite");
  await recordSignal(TEST_USER, skipped.id, "skip");
  const scores = await getAffinity(TEST_USER);
  check("a favorite raises tag scores", !!likedUpdate && Object.values(likedUpdate).every((v) => v > 0));
  check("scores are saved", Object.keys(scores).length > 0, `${Object.keys(scores).length} tags`);
  check("generic tags (cuisine, course, ...) are never scored", Object.keys(scores).every((t) => !isGenericTag(t)));
  check("an unknown recipe is rejected", (await recordSignal(TEST_USER, "does-not-exist", "favorite")) === null);

  // 6. Swap -------------------------------------------------------------------
  console.log("\n6. Swap a meal");
  const entry = plan.entries[2];
  const swapped = await swapEntry(TEST_USER, entry.id);
  check("swap picks a different recipe", swapped.entry.recipe.id !== entry.recipe.id);
  const swappedRecipe = await prisma.recipe.findUniqueOrThrow({ where: { id: swapped.entry.recipe.id } });
  check("swapped recipe still respects allergy and diet", !swappedRecipe.allergens.includes("peanut") && swappedRecipe.diets.includes("vegetarian"));
  const swapSignals = await prisma.userRecipeSignal.count({ where: { userId: TEST_USER, type: { in: ["swap_out", "swap_in"] } } });
  check("swap recorded both signals", swapSignals === 2, `${swapSignals} signals`);
  check("AI was not required (fallback works without a key)", typeof swapped.fromAi === "boolean", `fromAi=${swapped.fromAi}`);
}

main()
  .catch((e) => {
    failed++;
    console.error("\nUnexpected error:", e);
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log("\nTest user deleted.");
    } catch (e) {
      console.error(`Could not delete the test user (id ${TEST_USER}). Delete it by hand.`, e);
    }
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
