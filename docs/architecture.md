# Architecture

The Adaptive AI Meal Planner is a responsive web app that recommends a recipe each day (MVP), sized to the user's calorie target and preferences, and adapts over time. Onboarding collects body stats, goal, cuisines, diet, allergies and equipment. Requests flow from the browser to our own API, where the user is authenticated, then to three core services and the database (Supabase). Gemini's free tier is a separate layer used only for ranking, step conversion, recipe modification and phrasing. Calorie math, filtering, substitution matching and personalization are computed in code.

## Principles
- Ground truth lives in our database (recipes, nutrition). The AI never invents recipes or macros.
- Allergy and diet filters, calorie math and ranking are deterministic code. The AI only phrases, converts and re-ranks a shortlist, and its output is always validated.
- The browser talks only to our API routes. Gemini and Supabase service keys stay server-side.
- Every API route verifies the logged-in user and returns only that user's data.

## Components

| Component | Responsibility |
| --- | --- |
| Web app | Next.js / React UI on Vercel: onboarding, daily recipe, recipe detail, shopping list, adherence dashboard. Calls only our API. |
| Backend API + Auth | Next.js API routes. Validates input, verifies the user on every request, returns only that user's data. The single security checkpoint. |
| Profile and calorie engine | Daily target from height, weight, age, sex, activity (Mifflin-St Jeor). Nudged by a small step after weekly weigh-ins, never below a safety floor. |
| Recommendation and substitution | Hard filters (allergies, diet), ranking by calorie fit and affinity, ingredient swaps by nearest-neighbor search on nutrition data, shopping list. |
| Adherence and preference learning | Meal logs (eaten, modified, skipped) for planned-vs-actual charts. Signals (swap, rating, favorite, skip) update per-user tag affinity. |
| Database | PostgreSQL via Prisma on Supabase. |
| Food.com dataset | Recipe source (ingredients, steps, nutrition). Imported once. |
| USDA FoodData Central | Ingredient nutrition for substitutions. Bulk downloaded once, no live calls. |
| Gemini API | Ranks candidates, converts steps for the user's equipment, phrases swap suggestions. |

## Key interactions
1. **Daily recommendation.** The API authenticates the user. The recommendation service loads their preferences and calorie target, filters recipes by allergies and diet, and pre-ranks them by calorie fit and affinity. Only this shortlist goes to the AI layer, which asks Gemini to choose and explain. The chosen recipe must be in the shortlist before it is saved.
2. **Swap and equipment conversion.** A swap re-ranks alternatives from the same filtered pool. If the recipe does not match the user's equipment, the user can request a conversion. The result is stored on that user's plan entry so it is not generated again.
3. **Learning loop.** Every swap, rating, favorite, skip and meal log is saved as a signal. Adherence turns signals into affinity scores and charts. Weekly weigh-ins nudge the calorie target, which feeds the next recommendation.
4. **Substitutions.** The closest ingredient by macro profile among allowed ingredients is found by nearest-neighbor search. Gemini only words the suggestion and does not decide the match.

## Security and authorization
- All traffic over HTTPS. Every request is checked with Supabase auth and scoped to that user.
- Gemini and other keys live only on the server.
- Only the fields needed for a task are sent to Gemini. Never name or email.

## Failure handling
If Gemini is unavailable, rate limited or returns an invalid result, the app still works: code-based ranking, original recipe steps with a note that conversion is unavailable, and template text for swaps. AI output is never trusted blindly: recipes must come from the filtered pool, allergies are re-checked, and the calorie target is enforced in code. USDA and Food.com are loaded once, so they are not runtime dependencies. Remaining dependencies: Vercel, Supabase and the Gemini free-tier quota.

## Implementation

### Auth (`src/server/auth`)
- `supabase-server.ts`: `createSupabaseServer()` builds a Supabase client bound to the request cookies.
- `cookies.ts`: `dropMalformedAuthCookies` removes login cookies that cannot be decoded before Supabase sees them. A forged or corrupted cookie makes Supabase's own decoder throw in a background promise, so the request is treated as logged out instead.
- `src/middleware.ts`: runs before every page (not API routes). It refreshes the Supabase login when its token has expired and forwards the new cookies, so server components always see a valid session, and it sends logged-out visitors from protected pages to `/login?next=<where they were going>`. It uses `getUser()`, which checks the token with Supabase, and treats any failure or unreadable cookie as logged out.
- `request-guard.ts`: `checkApiRequest`, run by the middleware on every `/api` request before any route code. It refuses `POST`/`PUT`/`PATCH`/`DELETE` that come from another site (`Origin` or `Sec-Fetch-Site: cross-site`, `403`) and bodies over 100 KB (`413`, or `411` when the length is unknown). Requests with no `Origin` (scripts, tests) pass. `next.config.mjs` adds the security headers and `Cache-Control: no-store` on API answers. See [security.md](security.md) for the full review and the open items.
- `routes.ts`: `PROTECTED_PAGES` (`/dashboard`, `/plan`, `/today`, `/recipes/*`, `/shopping-list`, `/onboarding`), `isProtectedPath`, `loginRedirect` and `safeNextPath`. **Login page: after a successful sign-in, send the user to `safeNextPath(next)`** (defaults to `/today`); never redirect to a raw `next` value, since `safeNextPath` is what blocks off-site redirects. Add new private pages to `PROTECTED_PAGES`.
- `require-user.ts`: `requireUser()` returns the verified user id (the `Profile.id`) or throws `UnauthorizedError`; any failure to read or verify the session counts as not logged in (401, never 500). `withUser(handler)` wraps a route handler, passes the user id as its first argument and answers 401 when not logged in. It also turns `HttpError` into a JSON error. All routes must use it.

Verified against the real Supabase project with two temporary users and the running dev server (33 checks): every route answers 401 with no login, a forged cookie or a fake token; a logged-in user can onboard, plan a week and read their own entries and shopping list; a second user gets 404 on the first user's entries, swap, convert, modify, plan and shopping list, and cannot tick their shopping items. The middleware was checked the same way (16 checks): logged-out visitors are redirected from every protected page with the right `next`, public pages and API routes are not redirected, a forged cookie counts as logged out, a valid login passes, and an expired token is refreshed with new cookies.

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`. `NEXT_PUBLIC_SUPABASE_URL` must be the plain project URL (`https://<ref>.supabase.co`), not the `/rest/v1/` address, or login calls go to the wrong place. The new `sb_publishable_` and `sb_secret_` keys go in the `apikey` header only, not as a bearer token.

### Planning engine (`src/server/planning`)
Pure functions over plain `RecipeLite` objects (see `src/types`), unit tested without a database. Checked against the real recipe table (about 20,000 recipes): a week plans in well under 100 ms and every day lands within a few kcal of the target.

1. `allergens.ts`: the canonical allergen labels used by the recipe import (`gluten`, `dairy`, `soy`, `egg`, `sesame`, `fish`, `shellfish`, `tree-nut`, `peanut`). `normalizeAllergies` maps what a user types ("milk", "nuts", "shrimp") onto them. **Onboarding should offer exactly these labels**, because recipes are matched on them. `ingredientHasAllergen` checks an ingredient name for an allergen using **whole words** ("lemon peel" is not fish, "eggplant" is not egg), with exceptions for safe look-alikes (peanut butter, coconut cream, rice noodles, plant milks, "vegan", "gluten-free" and "dairy free" labels) and keyword lists that include cheese names, pasta shapes, less common fish and shellfish and compounds like "crabmeat" and "soymilk". `detectAllergens` labels AI recipes with it.
2. `filter.ts` `filterRecipes`: removes recipes containing the user's allergens, keeps only the user's diet (`vegetarian`, `vegan`, `dairy-free`, `gluten-free`), drops excluded ids. Equipment is never a filter.
3. `meal-types.ts` `fitsMeal`: only recipes tagged for the meal are used (dinner: `main-dish`, `one-dish-meal`, `soups-stews`), so a chutney never lands as dinner. If nothing is tagged for the meal, every allowed recipe is used.
4. `rank.ts` `rankRecipes`: score = relative calorie error minus `0.05 x` summed tag affinity. Lower is better, ties break on id. The affinity map comes from `server/adherence`.
5. `generate-plan.ts` `generatePlan`: one recipe per day, sized to the meal's share of the daily target (`MEAL_SHARE`, dinner = 40%). Pass `seed` (for example `userId:weekStart`) to draw the week from the top candidates in a repeatable shuffle, so the same week is stable but the next week differs. Pass `excludeIds` with recently used recipes. Recipes are not repeated within a plan unless the pool runs out.

5b. **Safety net on real ingredients.** The recipe tags are not fully reliable: in the imported data about 1 percent of recipes contain an allergen ingredient the `allergens` tag does not list (conch, crabmeat, pollock, soymilk, gruyere, pita), and 3 to 9 percent of recipes tagged vegetarian, vegan or gluten-free contain an ingredient that breaks the diet (bacon or beef base in a vegetarian soup, butter in a vegan dish, breadcrumbs in a gluten-free one). So `dropUnsafeByIngredients` in `service.ts` looks at the actual ingredient names of the 60 best-ranked candidates and drops any recipe that triggers one of the user's allergens, breaks their diet (`violatesDiet`), or mentions a word they asked to avoid. It runs for the weekly plan, recommendations and swaps. The tags still do the first, cheap filtering in SQL.
5c. `wish.ts` (text swap): `parseWish` turns a request like "something light with chicken, no onions" into wanted words (`chicken`) and avoided words (`onion`), ignoring filler and treating anything after "no", "without" or "avoid" as avoided. Words are matched on stems, so "cheese" also finds "cheesy". With a request, SQL loads only recipes whose name or tags mention a wanted word (still inside the diet, allergy and calorie filters), `applyWish` puts the best matches first and removes avoided ones, and the AI picks from that shortlist. The request reaches the AI as quoted data, never as instructions, and the AI's pick must be in the shortlist. If the wanted words match nothing the swap falls back to a normal one that still honours the avoided words (`matchedRequest: false`). Limits: wanted words are matched on recipe names and tags only ("light" matches nothing), and avoided words are also checked against the real ingredient list.
6. `substitution.ts` `findSubstitutes`: nearest-neighbor search over `Ingredient` rows. Candidates stay in the original's category, must be used by at least 15 recipe lines (so nobody is told to cook with antelope), never contain the user's allergens (matched on the ingredient name, so this is a best-effort check) and respect the diet. In the USDA table every `protein` row is an animal food, so vegetarians only get eggs from it and vegans get none. Distance is the sum of relative differences in calories, protein, carbs and fat; anything above 1 is dropped, 0.5 or less is `close`, the rest `rough`. `grams` scales the amount to keep calories the same. The AI only words the best `close` suggestion (6 second limit, template sentence otherwise); it never picks or judges the match. Limitations: matching a recipe's wording to an ingredient can land on a generic word ("tagliatelle pasta noodles" matches `noodle`), which is why the response says `matchedAs`; very common items with no close relative (butter) return nothing.

Loading every recipe takes about 2 seconds, so the services narrow the query in SQL first and rank only that set. Ingredient quantities in the dataset are placeholders (`1 item`), so shopping lists and the AI modify/convert prompts do not have real amounts yet.

### AI layer (`src/server/ai`)
Receives only the ranked shortlist. Falls back to the code-based result on any failure (see Failure handling). Four jobs:
- **Choose and explain** a recipe from the shortlist.
- **Convert** steps for the user's equipment. Stored on the plan entry (`convertedSteps`, `convertedForEquipment`).
- **Modify** a recipe on request (for example "make it vegetarian" or "less spicy"). Stored per user on `PlanEntry.modifiedRecipe`, never on the shared recipe. Allergies are re-checked and calories recomputed in code.
- **Generate** a new recipe from the user's tastes (top tag affinities, favorites) and a few dataset recipes. Saved as a private `Recipe` (`source = "ai"`, `ownerId` = the user, `basedOnIds` = the inspiration recipes). Nutrition is never taken from the AI: it is computed in code from `Ingredient`. Rejected if it contains an allergen or an ingredient we cannot match.

Files:
- `gemini.ts`: the only code that calls Gemini (server-side). Uses the `gemini-flash-latest` alias and tries `gemini-flash-lite-latest` if the first fails. Set `GEMINI_MODEL` to force one model. 15 second timeout per call. A model that returns an overload (503) or timeout is skipped for 60 seconds, and one that returns a quota error (429) for 5 minutes, so users do not wait on a model that is down. The free tier's quota is small and can run out during heavy testing, in which case every AI feature falls back to its code-based result (that is by design, see Failure handling).
- `adapter.ts`: `chooseRecipe`, `convertSteps`, `modifyRecipe`, `generateRecipe`. Each takes an injectable `llm` function (tests use a fake), parses the reply with Zod and falls back safely: top-ranked recipe, original steps, or `null` for modify/generate. Prompts carry recipe and preference data only, never a name, email or user id. Free-text user requests are clipped and sent as quoted data.
- `nutrition.ts`: `buildNutritionLookup(rows)` turns `Ingredient` rows into the name lookup, and `computeNutrition` sums per-100g data over ingredient weights (returns `null` if any ingredient is unknown). Matching, in order: the exact name; leading words dropped ("ground cumin" becomes "cumin"); trailing words dropped; known synonyms (cilantro, scallion, gingerroot, plain "flour" is all-purpose); then any ingredient whose name contains the words ("oil", "cumin" to "cumin seed"), but only when the shortest such names agree on calories, so an ambiguous word is left unmatched rather than guessed. Plurals, punctuation and portion words are handled ("garlic cloves" is garlic, not the spice clove; "ground cloves" is the spice), cooked variants are skipped unless the recipe says cooked, and water is 0 kcal. These fallbacks can land on a broader food, so they are for nutrition estimates only; allergen checks never use them. Against the full USDA import, about 92% of ingredient lines across all dataset recipes match. Known data issue: some plain USDA names are the dried version (`milk` 496 kcal, `egg` 322, `ginger` 335), which the lookup cannot detect.

Checks applied in code to AI output: the chosen id must be in the shortlist, allergens are re-checked on modified and generated recipes (`ingredientsHaveAllergen`), generated recipes are rejected if calories land more than 35% from the target, and modified recipes recompute calories when every ingredient is in grams (otherwise the original calories are kept and `caloriesVerified` is false).

### Services (database plus the engines above)
- `planning/service.ts`: `createWeekPlan`, `getWeekPlan`, `recommendForDay`, `swapEntry`, `getRecipeForUser`, `getEntryDetail`. Candidates are narrowed in SQL (visible recipes, calorie window around the meal target, meal tags, allergens, diet) and filtered again in code. Recipes used in the previous 3 weeks are skipped. Taste scores are the learned affinity plus a +1 boost for each cuisine chosen at onboarding. Plans start on a Monday.
- `ai/service.ts`: `convertEntry`, `modifyEntry`, `resetModification`, `generateForUser`. Every entry is looked up with its `userId`, so another user's entry or private AI recipe is a 404. AI calls (including the AI pick in recommendations and swaps) are limited to 6 a minute per user (`ai/rate-limit.ts`; over the limit, recommendations and swaps use the top-ranked recipe instead of failing, the free Gemini tier is shared by everyone) and 10 generated recipes a day.
- `adherence/meal-logs.ts`: `saveMealLog`, `listMealLogs`, `deleteMealLog`, `getAdherence`. One log per planned meal (logging again updates it, so a planned meal cannot be counted twice); planned values come from the plan, with the modified recipe's calories when the user changed it. A `skipped` meal records one `skip` signal. Date ranges default to the last 28 days, are limited to 120 days and never go past today.
- `adherence/analytics.ts`: pure functions (no database) that turn plans, logs and weigh-ins into per-day and per-week summaries and the adherence-versus-weight relationship (Pearson correlation, only reported once 3 weeks have both numbers). Rates are `null`, never `NaN`, when there is nothing to divide by, and days with no log are left out of calorie comparisons so they do not look like undereating.
- `ai/lookup.ts`: builds the ingredient lookup and an ingredient index (rows, name matcher, and how many recipe lines use each ingredient) from the `Ingredient` table and reuses them for 10 minutes.
- Services throw `HttpError(status, message)`; `withUser` turns it into a JSON error response.

## API routes
All routes need a logged-in user (401 otherwise) and only ever touch that user's data. Errors are `{ error: string }`. Dates are `YYYY-MM-DD`. A "plan entry" is one recipe on one day.

| Route | Body or query | Returns |
| --- | --- | --- |
| `GET /api/plan?date=` | date optional (default today) | `{ plan }` for that week, or 404 if none yet |
| `POST /api/plan` | `{ date?, regenerate? }` | `{ plan }`: 7 dinners, one per day. Returns the existing plan unless `regenerate` is true. 409 if onboarding is unfinished |
| `POST /api/recommendation` | `{ date?, mealType?, extra? }` | `{ entry, reason, fromAi }`. A day with a pick returns it; `extra: true` adds another recipe that day |
| `POST /api/swap` | `{ entryId, request? }` | `{ entry, reason, fromAi, matchedRequest }`: a new recipe in place of the old one. `request` is optional plain text ("something with chicken", "lighter, no onions", max 200 characters): the new recipe is chosen from recipes matching it, always inside the user's diet and allergies. `matchedRequest` is `true` when something matched, `false` when nothing did (a normal swap was done and `reason` says so), `null` when no request was sent |
| `POST /api/convert` | `{ entryId }` | `{ available, steps, note, cached }`: steps for the user's equipment. 400 if no equipment in the profile |
| `POST /api/modify` | `{ entryId, request }` | `{ entry, modified }` for a change like "make it spicier". 422 if it fails the allergy checks. `DELETE` with `{ entryId }` undoes it |
| `POST /api/generate` | `{ wish?, date?, mealType? }` | `{ recipe, entry }`: a new private AI recipe. With `date` it is also added to that day. 422: try again |
| `POST /api/substitute` | `{ entryId, ingredient }` | `{ ingredient, matchedAs, amountAssumed, originalGrams, substitutes: [{ name, category, quality, grams, distance, per100g, note }] }`: up to 3 swaps for one ingredient. 404 if the ingredient is not in the recipe, 422 if we have no nutrition data for it. `substitutes` can be empty (no close swap) |
| `POST /api/meal-logs` | `{ entryId?, status, calories?, proteinG?, carbsG?, fatG?, note?, date?, mealType? }` | `{ log }`: what was actually eaten (`eaten_as_planned`, `modified`, `skipped`, `ad_hoc`). Logging a planned meal again updates it; skipping teaches the preference model. `GET` (with `from`/`to`) lists logs, `DELETE { id }` undoes one |
| `GET /api/adherence` | `from?`, `to?` | `{ totals, days, weeks, adherenceVsWeight }`: planned versus actual for the dashboard charts, per day and per week, with the weekly average weight and how closely following the plan relates to weight change |
| `GET /api/entries/:id` | | `{ entry, recipe, convertedSteps, convertedForEquipment, modifiedRecipe }`: everything the recipe page needs |
| `GET /api/recipes/:id` | | `{ recipe }` with ingredients, steps and macros |

`quality` is `close` or `rough`: show rough swaps as a weaker suggestion. `grams` keeps the calories the same. `amountAssumed` is true when the recipe has no gram amount, so 100 g was assumed. `note` is a ready-to-show sentence.

A plan looks like `{ id, weekStart, calorieTarget, entries: [{ id, date, mealType, position, recipe: { id, name, calories, proteinG, carbsG, fatG, tags, equipment }, converted, modified }] }`. Show `modifiedRecipe` instead of the recipe's ingredients and steps when it is not null, and `convertedSteps` instead of the steps when not empty. A `reason` is a short sentence explaining an AI pick. Tell the user when `fromAi` is false only if it matters; the pick is still valid.

Other routes owned by the backend lane: `/api/profile`, `/api/logs`, `/api/signals`, `/api/shopping-list`.

## Data model (`prisma/schema.prisma`)

| Table | Purpose |
| --- | --- |
| `Profile` | User and preferences: body stats, goal and weekly rate, cuisines, diet, allergies, equipment, calorie target. |
| `WeightLog` | Weekly weigh-ins that drive the calorie nudge. |
| `Recipe` | Dataset recipes (shared) and AI-generated recipes (private to `ownerId`). Queries must return `ownerId` null or the caller's id only. |
| `WeeklyPlan` | One week per user, with the calorie target it was built on. |
| `PlanEntry` | A recipe on a day. `position` 0 is the main pick, 1 and up are extras the user asked for. Also holds cached conversion and modification. |
| `FavoriteRecipe` | Saved recipes, with their own cached conversion. |
| `ShoppingListItem` | Aggregated ingredients for a week's plan. |
| `MealLog` | What was actually eaten (eaten as planned, modified, skipped, ad hoc) for adherence charts. |
| `UserRecipeSignal` | Raw log of swaps, ratings, favorites and skips. |
| `UserTagAffinity` | Running per-tag score built from signals and read by `rank.ts`. |
| `Ingredient` | USDA subset with a `category`. Used for substitutions and for AI-recipe nutrition. |

The latest migration (`20261116222854_add_plan_logs_signals_ai_recipes`) adds the tables above to the original five and enables RLS on them. It assumes `PlanEntry` is still empty because `planId` is required. Apply it with `npx prisma migrate deploy` (or `migrate dev`), then tell the team.

## Tests
`tests/` mirrors `src/server`. Run `npm test`.
