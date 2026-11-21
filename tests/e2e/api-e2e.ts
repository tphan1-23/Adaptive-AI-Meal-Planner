// End-to-end check of the HTTP API with a real login, the way the phone app calls it.
//
//   npm run dev:lan            (in another terminal; or any running API)
//   npm run test:api-e2e       (API_URL defaults to http://127.0.0.1:3000)
//
// It creates a throwaway Supabase user (admin API), signs in to get a real access token, calls the routes
// with `Authorization: Bearer <token>`, prints PASS/FAIL per step, then deletes the user and their data
// (profile rows cascade). It needs the keys in .env, including SUPABASE_SERVICE_ROLE_KEY, so run it only
// from a trusted machine. NOT part of `npm test`.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { prisma } from "../../src/server/db/prisma";

const API = (process.env.API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

let token = "";
async function call(path: string, init: { method?: string; json?: unknown; auth?: boolean } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers: {
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.auth === false ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  if (!url || !anon || !service) throw new Error("Missing Supabase keys in the environment (.env)");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const email = `e2e-${randomBytes(6).toString("hex")}@example.test`;
  const password = randomBytes(12).toString("base64url");
  let userId: string | null = null;

  try {
    console.log("\n0. Throwaway user and token");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    check("test user created", !created.error && !!created.data.user, created.error?.message);
    userId = created.data.user?.id ?? null;
    const signedIn = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
    token = signedIn.data.session?.access_token ?? "";
    check("signed in, got an access token", token.split(".").length === 3, signedIn.error?.message);

    console.log("\n1. Auth");
    check("no token -> 401", (await call("/api/profile", { auth: false })).status === 401);
    const saved = token;
    token = "aaa.bbb.ccc";
    check("forged token -> 401", (await call("/api/profile")).status === 401);
    token = saved;
    check("real token -> 200", (await call("/api/profile")).status === 200);
    check("new user has no profile yet", (await call("/api/profile")).body?.profile === null);
    check("today before onboarding -> 409", (await call("/api/plan", { method: "POST", json: {} })).status === 409);

    console.log("\n2. Onboarding and plan");
    const put = await call("/api/profile", {
      method: "PUT",
      json: { heightCm: 178, weightKg: 82, age: 28, sex: "male", activityLevel: "moderate", goal: "lose", goalRateKg: 0.5, cuisines: ["italian"], diet: "vegetarian", allergies: ["peanut"], equipment: ["oven", "stovetop"] },
    });
    check("profile saved with a calorie target", put.status === 200 && put.body?.profile?.calorieTarget > 1500, `status ${put.status}`);
    const plan = await call("/api/plan", { method: "POST", json: {} });
    const entries = plan.body?.plan?.entries ?? [];
    check("plan has 7 meals", plan.status === 200 && entries.length === 7, `status ${plan.status}, ${entries.length} meals`);
    const entry = entries[0];

    console.log("\n3. Swap options (new)");
    const opts = await call("/api/swap/options", { json: { entryId: entry.id } });
    const options: { recipeId: string; name: string; calories: number; note: string }[] = opts.body?.options ?? [];
    check("returns up to 3 options", opts.status === 200 && options.length >= 1 && options.length <= 3, `${options.length} options`);
    check("options are not already in the week", options.every((o) => !entries.some((e: { recipe: { id: string } }) => e.recipe.id === o.recipeId)));
    check("every option has a note", options.every((o) => typeof o.note === "string" && o.note.length > 0));
    const rows = await prisma.recipe.findMany({ where: { id: { in: options.map((o) => o.recipeId) } }, select: { allergens: true, diets: true } });
    check("options respect peanut allergy and vegetarian diet", rows.every((r) => !r.allergens.includes("peanut") && r.diets.includes("vegetarian")));
    const filtered = await call("/api/swap/options", { json: { entryId: entry.id, request: "something with beans" } });
    check("a text request is accepted", filtered.status === 200 && Array.isArray(filtered.body?.options), `status ${filtered.status}`);
    check("unknown entry -> 404", (await call("/api/swap/options", { json: { entryId: "nope" } })).status === 404);

    console.log("\n4. Swap with a chosen option (new)");
    check("a made-up recipeId is refused (422)", (await call("/api/swap", { json: { entryId: entry.id, recipeId: "not-a-real-recipe" } })).status === 422);
    const pick = options[0];
    const swapped = await call("/api/swap", { json: { entryId: entry.id, recipeId: pick.recipeId } });
    check("chosen recipe is applied", swapped.status === 200 && swapped.body?.entry?.recipe?.id === pick.recipeId, `status ${swapped.status}`);
    check("no AI used for a chosen option", swapped.body?.fromAi === false);
    const afterPlan = (await call("/api/plan")).body?.plan?.entries ?? [];
    check("plan now shows the new recipe", afterPlan.some((e: { id: string; recipe: { id: string } }) => e.id === entry.id && e.recipe.id === pick.recipeId));

    console.log("\n4b. AI-backed routes (use the Gemini key; fall back safely if the AI is down)");
    const aiSwap = await call("/api/swap", { json: { entryId: entries[1].id } });
    check("AI swap returns a new entry with a reason", aiSwap.status === 200 && !!aiSwap.body?.entry?.recipe?.id && typeof aiSwap.body?.reason === "string", `status ${aiSwap.status}, fromAi ${aiSwap.body?.fromAi}`);
    const conv = await call("/api/convert", { json: { entryId: entry.id } });
    check("convert answers 200 with available true/false", conv.status === 200 && typeof conv.body?.available === "boolean", `status ${conv.status}, available ${conv.body?.available}`);
    check("convert always returns steps", Array.isArray(conv.body?.steps) && conv.body.steps.length > 0);

    console.log("\n5. Recipe, logging, progress, shopping");
    const detail = await call(`/api/entries/${entry.id}`);
    check("entry detail has recipe, steps and ingredients", detail.status === 200 && detail.body?.recipe?.ingredients?.length > 0);
    const log = await call("/api/meal-logs", { json: { entryId: entry.id, status: "eaten_as_planned" } });
    check("meal logged", log.status === 201, `status ${log.status} ${log.body?.error ?? ""}`);
    const wl = await call("/api/logs", { json: { weightKg: 81.6 } });
    check("weigh-in saved", wl.status === 201, `status ${wl.status}`);
    const today = new Date();
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const adh = await call(`/api/adherence?from=${iso(mon)}&to=${iso(today)}`);
    check("adherence returns totals and days", adh.status === 200 && !!adh.body?.totals && Array.isArray(adh.body?.days), `status ${adh.status}`);
    const shop = await call("/api/shopping-list");
    check("shopping list has items", shop.status === 200 && shop.body?.items?.length > 0, `status ${shop.status}`);
    check("signals endpoint answers", (await call("/api/signals")).status === 200);

    console.log("\n6. Photos and favorites");
    const recipeId: string = detail.body.recipe.id;
    check("recipe detail carries imageUrl and isFavorite", "imageUrl" in detail.body.recipe && detail.body.recipe.isFavorite === false);
    check("plan entries carry imageUrl", "imageUrl" in (afterPlan[0]?.recipe ?? {}));
    check("empty favorites list at first", (await call("/api/favorites")).body?.favorites?.length === 0);
    check("saving a recipe -> 201", (await call("/api/favorites", { json: { recipeId } })).status === 201);
    check("saving it again -> 200", (await call("/api/favorites", { json: { recipeId } })).status === 200);
    const favs = (await call("/api/favorites")).body?.favorites ?? [];
    check("saved list has the recipe once", favs.length === 1 && favs[0].id === recipeId && "imageUrl" in favs[0]);
    check("entry detail now says isFavorite", (await call(`/api/entries/${entry.id}`)).body?.recipe?.isFavorite === true);
    check("saving an unknown recipe -> 404", (await call("/api/favorites", { json: { recipeId: "nope" } })).status === 404);
    check("removing it works", (await call("/api/favorites", { method: "DELETE", json: { recipeId } })).status === 200 && (await call("/api/favorites")).body?.favorites?.length === 0);

    console.log("\n7. Logging other food");
    const todayIso = iso(today);
    const food = await call("/api/meal-logs", { json: { status: "ad_hoc", calories: 320, mealType: "snack", date: todayIso, note: "test snack" } });
    check("other food logged (201)", food.status === 201, `status ${food.status} ${food.body?.error ?? ""}`);
    const dayLogs = (await call(`/api/meal-logs?from=${todayIso}&to=${todayIso}`)).body?.logs ?? [];
    check("it appears in today's logs with its note", dayLogs.some((l: { id: string; note: string }) => l.id === food.body?.log?.id && l.note === "test snack"));
    check("calories above 5000 are refused", (await call("/api/meal-logs", { json: { status: "ad_hoc", calories: 9000, mealType: "snack", date: todayIso } })).status === 400);
    check("it can be removed", (await call("/api/meal-logs", { method: "DELETE", json: { id: food.body?.log?.id } })).status === 200);

    console.log("\n8. Choosing equipment to convert for");
    const conv2 = await call("/api/convert", { json: { entryId: entries[2].id, equipment: ["stovetop"] } });
    check("convert for a chosen appliance answers 200", conv2.status === 200 && Array.isArray(conv2.body?.steps) && conv2.body.steps.length > 0, `status ${conv2.status}`);
    check("answer says which equipment was used", Array.isArray(conv2.body?.equipment) && conv2.body.equipment.includes("stovetop"));
    check("an unknown appliance is refused", (await call("/api/convert", { json: { entryId: entries[2].id, equipment: ["toaster"] } })).status === 400);
    check("an empty equipment list is refused", (await call("/api/convert", { json: { entryId: entries[2].id, equipment: [] } })).status === 400);

    console.log("\n9. Editing settings keeps the calorie target unless body or goal changes");
    const p0 = (await call("/api/profile")).body.profile;
    const body = { heightCm: p0.heightCm, weightKg: p0.weightKg, age: p0.age, sex: p0.sex, activityLevel: p0.activityLevel, goal: p0.goal, goalRateKg: p0.goalRateKg, cuisines: p0.cuisines, diet: p0.diet, allergies: p0.allergies, equipment: p0.equipment };
    const afterDiet = await call("/api/profile", { method: "PUT", json: { ...body, diet: "vegan", equipment: ["oven"] } });
    check("changing diet and equipment keeps the target", afterDiet.body?.profile?.calorieTarget === p0.calorieTarget, `${p0.calorieTarget} -> ${afterDiet.body?.profile?.calorieTarget}`);
    const afterAge = await call("/api/profile", { method: "PUT", json: { ...body, age: p0.age + 5 } });
    check("changing age recomputes the target", afterAge.status === 200 && afterAge.body?.profile?.calorieTarget !== p0.calorieTarget, `${p0.calorieTarget} -> ${afterAge.body?.profile?.calorieTarget}`);

    console.log("\n10. Deleting the account");
    check("missing confirmation -> 400", (await call("/api/account", { method: "DELETE", json: { password } })).status === 400);
    check("wrong password -> 403 and nothing deleted", (await call("/api/account", { method: "DELETE", json: { confirm: "DELETE", password: "not-it" } })).status === 403 && (await prisma.profile.count({ where: { id: userId! } })) === 1);
    check("no login -> 401", (await call("/api/account", { method: "DELETE", json: { confirm: "DELETE", password }, auth: false })).status === 401);
    const del = await call("/api/account", { method: "DELETE", json: { confirm: "DELETE", password } });
    check("correct password deletes the account", del.status === 200 && del.body?.deleted === true, `status ${del.status} ${del.body?.error ?? ""}`);
    check("profile and data are gone", (await prisma.profile.count({ where: { id: userId! } })) === 0 && (await prisma.planEntry.count({ where: { userId: userId! } })) === 0);
    check("the login is gone too", (await admin.auth.admin.getUserById(userId!)).data.user === null);
    check("the old token no longer works", (await call("/api/profile")).status === 401);
    userId = null; // already deleted by the endpoint, nothing left to clean up
  } finally {
    // Clean up even if a step threw: profile rows first (cascade), then the auth user.
    if (userId) {
      await prisma.profile.deleteMany({ where: { id: userId } });
      const del = await admin.auth.admin.deleteUser(userId);
      console.log(`\nCleanup: test user ${del.error ? "NOT deleted: " + del.error.message : "deleted"}`);
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("\nE2E crashed:", e);
  process.exit(1);
});
