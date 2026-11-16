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
- `require-user.ts`: `requireUser()` returns the verified user id (the `Profile.id`) or throws `UnauthorizedError`. `withUser(handler)` wraps a route handler, passes the user id as its first argument and answers 401 when not logged in. All routes must use it.

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`.

### Planning engine (`src/server/planning`)
Pure functions over plain `RecipeLite` objects (see `src/types`), unit tested without a database.

1. `filter.ts` `filterRecipes`: removes recipes containing the user's allergens, keeps only the user's diet, drops excluded ids. Equipment is never a filter.
2. `rank.ts` `rankRecipes`: score = relative calorie error minus `0.05 x` summed tag affinity. Lower is better, ties break on id. The affinity map comes from `server/adherence`.
3. `generate-plan.ts` `generatePlan`: one recipe per day, sized to the meal's share of the daily target (`MEAL_SHARE`, dinner = 40%), no repeats until the pool is exhausted.

### AI layer (`src/server/ai`)
Receives only the ranked shortlist. Falls back to the code-based result on any failure (see Failure handling). Four jobs:
- **Choose and explain** a recipe from the shortlist.
- **Convert** steps for the user's equipment. Stored on the plan entry (`convertedSteps`, `convertedForEquipment`).
- **Modify** a recipe on request (for example "make it vegetarian" or "less spicy"). Stored per user on `PlanEntry.modifiedRecipe`, never on the shared recipe. Allergies are re-checked and calories recomputed in code.
- **Generate** a new recipe from the user's tastes (top tag affinities, favorites) and a few dataset recipes. Saved as a private `Recipe` (`source = "ai"`, `ownerId` = the user, `basedOnIds` = the inspiration recipes). Nutrition is never taken from the AI: it is computed in code from `Ingredient`. Rejected if it contains an allergen or an ingredient we cannot match.

Files:
- `gemini.ts`: the only code that calls Gemini (server-side). Uses the `gemini-flash-latest` alias and tries `gemini-flash-lite-latest` if the first fails. Set `GEMINI_MODEL` to force one model. 20 second timeout per call.
- `adapter.ts`: `chooseRecipe`, `convertSteps`, `modifyRecipe`, `generateRecipe`. Each takes an injectable `llm` function (tests use a fake), parses the reply with Zod and falls back safely: top-ranked recipe, original steps, or `null` for modify/generate. Prompts carry recipe and preference data only, never a name, email or user id. Free-text user requests are clipped and sent as quoted data.
- `nutrition.ts`: `computeNutrition` sums per-100g `Ingredient` data over ingredient weights. Returns `null` if any ingredient is unknown.

Checks applied in code to AI output: the chosen id must be in the shortlist, allergens are re-checked on modified and generated recipes (`ingredientsHaveAllergen`), generated recipes are rejected if calories land more than 35% from the target, and modified recipes recompute calories when every ingredient is in grams (otherwise the original calories are kept and `caloriesVerified` is false).

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
