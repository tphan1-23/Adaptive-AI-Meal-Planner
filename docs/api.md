# API reference

All endpoints are Next.js route handlers under `src/app/api/`. The browser only talks to these,
never to Gemini or the database directly.

## Conventions

- **Auth:** every endpoint requires a logged-in Supabase session (cookie). Without one the response is
  `401 { "error": "Unauthorized" }`. A user only ever sees and changes their own data.
- **Errors:** always `{ "error": "message" }`. Validation failures also include `issues` (the zod issue list).
- **Dates:** `YYYY-MM-DD`. A "week" starts on Monday.
- **Bodies:** JSON, with `Content-Type: application/json`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (or missing prerequisite, e.g. no equipment saved) |
| 401 | Not logged in |
| 404 | Not found, or it belongs to another user |
| 409 | Onboarding not finished (no profile or calorie target yet) |
| 422 | Nothing matches the filters, or an AI result failed validation. Safe to retry |
| 429 | AI rate limit (6 calls per minute per user) or daily AI-recipe limit (10) |

## Allowed values (use these exact strings in forms)

| Field | Values |
| --- | --- |
| `sex` | `male`, `female` |
| `activityLevel` | `sedentary`, `light`, `moderate`, `active`, `very_active` |
| `goal` | `lose`, `maintain`, `gain` |
| `diet` | `vegetarian`, `vegan`, `gluten-free`, `dairy-free` (or `null`) |
| `allergies` | `peanut`, `tree-nut`, `dairy`, `egg`, `gluten`, `soy`, `fish`, `shellfish`, `sesame` |
| `equipment` | `oven`, `stovetop`, `microwave`, `grill`, `slow-cooker`, `pressure-cooker`, `blender`, `food-processor`, `air-fryer`, `stand-mixer`, `rice-cooker`, `steamer` |
| `cuisines` | `vietnamese`, `dominican`, `kazakh`, `russian`, `american`, `italian`, `french`, `asian`, `chinese`, `japanese`, `thai`, `korean`, `indian`, `filipino`, `indonesian`, `malaysian`, `caribbean`, `cuban`, `mexican`, `greek`, `spanish`, `german`, `middle-eastern` |
| `mealType` | `breakfast`, `lunch`, `dinner`, `snack` |

The source of truth is `src/server/db/vocab.ts`.

---

## Profile

### `GET /api/profile`
The logged-in user's profile, or `null` before onboarding.
```json
{ "profile": { "id": "…", "heightCm": 180, "weightKg": 80, "age": 30, "sex": "male",
  "activityLevel": "moderate", "goal": "lose", "goalRateKg": 0.5, "cuisines": ["italian"],
  "diet": "vegetarian", "allergies": ["peanut"], "equipment": ["oven"], "calorieTarget": 2209 } }
```

### `PUT /api/profile`
Save the onboarding answers. Creates or updates the profile and computes the starting `calorieTarget`
(Mifflin-St Jeor TDEE, adjusted for the goal, never below the safety floor). The first save also records the
starting weight.
```json
{ "heightCm": 180, "weightKg": 80, "age": 30, "sex": "male", "activityLevel": "moderate",
  "goal": "lose", "goalRateKg": 0.5,
  "cuisines": ["vietnamese", "italian"], "diet": "vegetarian",
  "allergies": ["peanut"], "equipment": ["oven", "stovetop"] }
```
Limits: `heightCm` 100-250, `weightKg` 30-300, `age` 13-100, `goalRateKg` 0-1 (kg per week, optional).
`cuisines`, `allergies`, `equipment` default to `[]`; `diet` and `goalRateKg` may be `null` or omitted.
Returns `{ "profile": { … } }` (same shape as GET). `400` on invalid input.

---

## Weigh-ins

### `GET /api/logs`
The 30 most recent weigh-ins, newest first.
```json
{ "logs": [ { "id": "…", "userId": "…", "weightKg": 79.6, "loggedAt": "2026-11-16T12:00:00.000Z" } ] }
```

### `POST /api/logs`
Save a weigh-in: `{ "weightKg": 79.6 }` (30-300). Returns `201`:
```json
{ "log": { "id": "…", "weightKg": 79.6, "loggedAt": "…" },
  "adjustment": { "newTarget": 2109, "changed": true, "trendKgPerWeek": -0.05,
                  "expectedKgPerWeek": -0.5, "reason": "Weight is trending higher than your goal, so the target was lowered slightly." } }
```
`adjustment` is `null` unless the previous weigh-in was at least 6 days earlier, so the target changes at most
about once a week. When evaluated, the target moves by one 100 kcal step only if the trend is more than 0.2 kg/week off
the goal's pace. It never goes below the safety floor (1500 kcal men, 1200 women).

---

## Weekly plan

An **entry** is one meal in a plan:
```json
{ "id": "…", "date": "2026-11-16", "mealType": "dinner", "position": 0,
  "recipe": { "id": "…", "name": "Pho Bo", "calories": 480, "proteinG": 28, "carbsG": 52, "fatG": 14,
              "tags": ["vietnamese", "asian"], "equipment": ["stovetop"] },
  "converted": false, "modified": false }
```

### `GET /api/plan?date=YYYY-MM-DD`
The plan for the week containing `date` (default: this week).
```json
{ "plan": { "id": "…", "weekStart": "2026-11-16", "calorieTarget": 2209, "entries": [ /* entries, sorted by date */ ] } }
```
`404` if no plan exists yet (call POST). `400` on a bad date.

### `POST /api/plan`
Plan a week of dinners, one per day. Body (all optional): `{ "date": "2026-11-16", "regenerate": false }`.
Returns the existing plan unless `regenerate` is `true`. Respects allergies and diet, avoids recipes used in the last
3 weeks, and favors the user's cuisines and learned tastes. Does not use the AI.

**If the user changed their allergies or diet since the plan was made** (for example by redoing onboarding), every meal
from today onwards that no longer fits is replaced with a safe one before the plan is returned, by both `POST` and
`GET /api/plan` (same plan id, same days). An AI modification that no longer fits is undone. A meal on a day that has
already passed is only kept if the user logged eating it. So the frontend does not need to regenerate the plan after a profile edit; just read it again.
Errors: `409` onboarding not finished, `422` no recipes match.

### `POST /api/recommendation`
One recipe for one day. Body (all optional): `{ "date", "mealType": "dinner", "extra": false }`.
A day that already has a pick returns it, unless `extra: true`, which adds another. The AI chooses from a shortlist
built in code and falls back to the top-ranked recipe if it is unavailable.
```json
{ "entry": { /* entry */ }, "reason": "Fits your calorie target and you like Italian food.", "fromAi": true }
```
`reason` is `null` when the day already had a pick. `fromAi` is `false` when the fallback was used.

---

## Recipe detail

### `GET /api/entries/:id`
Use this for the recipe page. One of the user's plan entries with the full recipe and their own changes.
```json
{ "entry": { /* entry */ },
  "recipe": { "id": "…", "name": "…", "source": "dataset", "calories": 480, "proteinG": 28, "carbsG": 52, "fatG": 14,
              "ingredients": [ { "name": "garlic", "quantity": 1, "unit": "item" } ],
              "steps": ["…"], "tags": ["…"], "equipment": ["…"], "allergens": ["…"], "diets": ["…"] },
  "convertedSteps": [], "convertedForEquipment": [], "modifiedRecipe": null }
```
Note: Food.com ingredients have **no real quantities** (`quantity: 1, unit: "item"`). Show names only for dataset recipes.

### `GET /api/recipes/:id`
`{ "recipe": { … } }` (same recipe shape). Shared recipes and the user's own AI recipes only, otherwise `404`.

---

## Swap, convert, modify, generate

### `POST /api/swap`
`{ "entryId": "…", "request": "something with chicken" }` replaces that meal with another that fits the user. Clears
any conversion or modification and teaches the preference model.

`request` is optional plain text up to 200 characters, such as `"something with chicken"`, `"Thai noodles"` or
`"lighter, no onions"`. Words after "no", "without" or "avoid" are things to leave out. The new recipe is chosen from
recipes that match the request, always inside the user's diet and allergies, so asking for "chicken" as a vegetarian
never returns real meat. Matching is on recipe names and tags, so vague words like "light" match nothing.

```json
{ "entry": { /* entry */ }, "reason": "It features tofu and has the calorie count closest to the target.",
  "fromAi": true, "matchedRequest": true }
```
`matchedRequest` is `true` when something matched the request, `false` when nothing did (a normal swap was done and
`reason` says nothing matched, and any "no X" words are still honoured), and `null` when no request was sent.
`fromAi` is `false` when the AI was unavailable or over its limit and the best match was used instead.
`404` unknown entry, `422` no other recipe fits.

### `POST /api/substitute`
`{ "entryId": "…", "ingredient": "butter" }` suggests up to 3 swaps for one ingredient of that meal's recipe
(`ingredient` must be one of the recipe's ingredient names, exactly as shown).
```json
{ "ingredient": "lemon", "matchedAs": "lemon", "amountAssumed": true, "originalGrams": 100,
  "substitutes": [ { "name": "lime", "category": "fruit", "quality": "close", "grams": 97, "distance": 0.04,
                     "per100g": { "calories": 30, "proteinG": 0.7, "carbsG": 10.5, "fatG": 0.2 },
                     "note": "You can easily swap the lemon for 97 grams of lime, which has about the same calories." } ] }
```
The swaps are found by matching calories and macros in the same food category, never contain the user's allergens and
respect their diet. `quality` is `close` or `rough`: show rough swaps as a weaker suggestion. `grams` keeps the
calories the same. `note` is a ready-to-show sentence (worded by the AI for the best close swap when available).
`amountAssumed` is `true` when the recipe gives no gram amount, so 100 g was used. `matchedAs` is the ingredient
we matched the recipe's wording to; it can be a generic word, so consider showing it. `substitutes` can be empty
(no close swap, for example butter). `404` if the ingredient is not in the recipe, `422` if we have no nutrition data
for it.

### `POST /api/convert`
`{ "entryId": "…" }` adapts the steps to the user's kitchen equipment (needs equipment in the profile, else `400`).
```json
{ "available": true, "steps": ["…"], "note": "", "cached": false }
```
When the AI is down or fails, `available` is `false` and `steps` are the **original** steps with a `note` to show the
user. A successful conversion is saved on the entry, so asking again returns `cached: true` at no cost.

### `POST /api/modify`
`{ "entryId": "…", "request": "make it vegetarian" }` (`request` 3-200 characters). Creates a version of the recipe
for this user only. Allergies are re-checked and calories recomputed in code.
Returns `{ "entry": { … }, "modified": { /* modified recipe: name, ingredients, steps, calories, … */ } }`.
`422` if it can't be done safely.

### `DELETE /api/modify`
`{ "entryId": "…" }` goes back to the original recipe. Returns `{ "ok": true }`.

### `POST /api/generate`
Build a brand-new AI recipe from the user's tastes. Body (all optional):
`{ "wish": "something spicy with noodles", "date": "2026-11-18", "mealType": "dinner" }`.
Nutrition is computed from ingredient data, not by the AI. The recipe is private to the user. With `date`, it is also
added to that day as an extra. Returns `{ "recipe": { … }, "entry": { … } | null }`.
`422` if the result fails validation (retry), `429` at the daily limit.

---

## Shopping list

### `GET /api/shopping-list?weekStart=YYYY-MM-DD`
The de-duplicated list for that week's plan. Omit `weekStart` for the most recent plan. Items already ticked stay ticked.
```json
{ "planId": "…", "weekStart": "2026-11-16",
  "items": [ { "id": "…", "name": "garlic", "quantity": 3, "unit": "item", "checked": false, "mealCount": 3 } ] }
```
`quantity` for dataset recipes counts how many times the item is needed (placeholder units). `mealCount` is how many
planned meals use it. `404` if the user has no plan.

### `PATCH /api/shopping-list`
`{ "itemId": "…", "checked": true }` ticks or unticks an item. Returns `{ "ok": true }`, or `404` if the item isn't theirs.

---

## Meal logs and adherence

Where the user says what they actually ate. This feeds the dashboard's planned-versus-actual charts.

### `POST /api/meal-logs`
Record a meal. `status` decides what else is needed:

| `status` | Needs | Calories stored |
| --- | --- | --- |
| `eaten_as_planned` | `entryId` | the planned meal's (the modified recipe's calories if the user changed it) |
| `skipped` | `entryId` | 0 |
| `modified` | `entryId`, `calories` | what the user sends |
| `ad_hoc` (not in the plan) | `calories`; `date` and `mealType` default to today and dinner; no `entryId` | what the user sends |

Optional on any: `proteinG`, `carbsG`, `fatG`, `note` (up to 300 characters). `calories` is 0-5000. For a planned meal the
date and meal type come from the plan entry. A meal cannot be logged for a day after tomorrow.
```json
{ "entryId": "…", "status": "modified", "calories": 950, "note": "added extra rice" }
```
Returns `201`:
```json
{ "log": { "id": "…", "date": "2026-11-18", "mealType": "dinner", "status": "modified", "entryId": "…",
           "recipe": { "id": "…", "name": "Pho Bo" }, "calories": 950, "proteinG": null, "carbsG": null,
           "fatG": null, "note": "added extra rice", "createdAt": "…" } }
```
Logging the same planned meal again **updates** the earlier log (one log per planned meal). Marking a meal `skipped`
also teaches the preference model (a `skip` signal), once, not on every save. `400` invalid input or a future date,
`404` if the entry is not the user's.

### `GET /api/meal-logs?from=YYYY-MM-DD&to=YYYY-MM-DD`
The user's logs, newest first, in the same shape as above. Defaults to the last 28 days, at most 120 days.
`{ "from": "…", "to": "…", "logs": [ { … } ] }`

### `DELETE /api/meal-logs`
`{ "id": "…" }` removes a log (undo). `{ "ok": true }`, or `404` if it is not the user's.

### `GET /api/adherence?from=YYYY-MM-DD&to=YYYY-MM-DD`
Planned versus actual, shaped for charts. Same range rules as above, and the end is never later than today (planned
meals in the future would look like missed meals).
```json
{ "from": "2026-10-24", "to": "2026-11-20",
  "totals": { /* summary, see below */ },
  "days":  [ { "date": "2026-11-18", "plannedMeals": 1, "plannedCalories": 899, "actualCalories": 950,
               "loggedPlannedMeals": 1, "eatenAsPlanned": 0, "modified": 1, "skipped": 0, "adHoc": 0, "loggedDays": 1,
               "plannedCaloriesOnLoggedDays": 899 } ],
  "weeks": [ { "weekStart": "2026-11-16", /* summary fields */ "avgWeightKg": 79.5, "weightChangeKg": -0.5 } ],
  "adherenceVsWeight": { "r": null, "weeks": 1, "note": "Not enough data yet: …" } }
```
A **summary** (in `totals` and every week) has the counts above plus:
- `loggedShare`: planned meals that were logged, 0 to 1 (`null` if nothing was planned)
- `followedRate`: of the planned meals that were logged, the share eaten exactly as planned, 0 to 1 (`null` if none logged)
- `calorieDifferencePerDay`: average actual minus planned calories over days that have a log (positive = ate more).
  Days with no log are left out, so they do not look like undereating.

A day or week with nothing logged has zeros and `null` rates, never `NaN`. Skipped meals count as 0 calories.
`weeks` are Monday-start calendar weeks; `avgWeightKg` is the average of that week's weigh-ins and `weightChangeKg` the
change from the previous week's average (`null` if either week has no weigh-in).
`adherenceVsWeight.r` (-1 to 1) relates how closely the plan was followed to the weekly weight change. It stays `null`
until 3 weeks have both numbers; show the `note` instead. It shows a pattern, not a cause.

Suggested charts: planned vs actual calories per day (bars), `followedRate` per week (line), and `avgWeightKg` per
week next to it.

---

## Preference learning

### `POST /api/signals`
Record how the user reacted to a recipe: `{ "recipeId": "…", "type": "favorite" }`.
`type` is `favorite`, `skip`, `swap_in`, `swap_out` or `rating` (a rating also needs `"value": 1-5`).
Generic dataset tags (`cuisine`, `course`, `30-minutes-or-less`, `vegan`, …) are ignored.
Returns `201 { "updatedTags": { "italian": 0.1, "pasta": 0.1 } }`. `404` if the recipe isn't visible to the user.

### `GET /api/signals`
```json
{ "affinity": { "italian": 0.3, "spicy": -0.1 }, "liked": ["italian"], "disliked": ["spicy"] }
```

---

## Typical flows

**First run:** `PUT /api/profile` → `POST /api/plan` → `GET /api/plan` → `GET /api/shopping-list`.

**Recipe page:** `GET /api/entries/:id` → optionally `POST /api/convert` or `POST /api/modify`.

**Weekly check-in:** `POST /api/logs` with the new weight, then re-read `GET /api/profile` for the updated target.

**Logging a day:** `GET /api/plan`, then `POST /api/meal-logs` for each meal (eaten, skipped or changed), plus `ad_hoc` for anything off plan. The dashboard reads `GET /api/adherence`.

## Not built yet

- Real ingredient quantities for dataset recipes.
