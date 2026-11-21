# Frontend guide

How to connect each page to the backend. The backend is finished and tested, so every page below can be built
against real data today. Request and response shapes are in [api.md](api.md); this page says **which page calls
what**, and the rules that are easy to get wrong.

## Ground rules

- The browser only calls our `/api/*` routes. The one exception is **sign-in and sign-out**, which use the Supabase
  browser client. Never call Gemini or read database tables from the browser.
- Every API call needs a logged-in session cookie. The middleware already redirects logged-out visitors from the
  private pages to `/login?next=...`, and API calls answer `401` when logged out.
- **AI calls are slow** (5 to 25 seconds): `/api/swap`, `/api/recommendation`, `/api/convert`, `/api/modify`,
  `/api/generate` and `/api/substitute`. Show a spinner, disable the button while it runs, and do not use a client
  timeout shorter than 30 seconds.
- Dataset recipes have **no real ingredient quantities** (`1 item`). Show ingredient names only; do not show "1 item".
- Use the allowed values in [api.md](api.md#allowed-values-use-these-exact-strings-in-forms) for every form field
  (allergies, diet, equipment, cuisines). The backend rejects anything else.

## Status codes every page should handle

| Code | What to do |
| --- | --- |
| 401 | Go to `/login?next=<current path>` |
| 409 | The user has not finished onboarding: go to `/onboarding` |
| 400 | Show the form errors from `issues` |
| 404 | "Not found" (also what another user's id returns) |
| 422 | Show the message and let the user retry (nothing matched, or the AI result was rejected) |
| 429 | "Please wait a minute" (AI limit reached) |

A small helper makes this one place (put it in `src/lib/api.ts`):

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong");
  return data as T;
}
```

## Sign-in (src/lib/supabase-browser.ts)

```ts
import { createBrowserClient } from "@supabase/ssr";

export const supabaseBrowser = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```

Sign in with `supabaseBrowser().auth.signInWithPassword({ email, password })` and sign up with `auth.signUp(...)`.
Sign out with `auth.signOut()` and then go to `/login`. Check in the Supabase dashboard which sign-in methods and
email-confirmation settings are switched on.

## Page by page

### /login
1. Sign in or sign up with the Supabase browser client.
2. Then `GET /api/profile`. If `profile` is `null`, go to `/onboarding`. Otherwise go to
   `safeNextPath(next)` (import it from `@/server/auth/routes`; it blocks redirects to other sites and defaults to
   `/today`). Never redirect to a raw `next` value.

### /onboarding
- One form (or a short multi-step quiz) with the fields in `PUT /api/profile`. Use the allowed-value lists for
  cuisines, diet, allergies and equipment. Allergies and diet are safety settings: explain that on the form.
- `PUT /api/profile` returns the profile with the computed `calorieTarget`. Show it ("Your daily target is 2209 kcal").
- Then `POST /api/plan` to create the first week, and go to `/today`.

### /today
- `GET /api/plan`. A `404` means no plan yet: call `POST /api/plan` and show it.
- Find today's entry (`entries` have a `date`). Show the recipe name, calories and macros.
- **Swap:** button plus an optional text box ("something with chicken", "lighter, no onions"):
  `POST /api/swap { entryId, request? }`. If `matchedRequest` is `false`, show the `reason` ("Nothing matched...").
- **Add another recipe today:** `POST /api/recommendation { date, extra: true }`.
- **Generate a new recipe for me:** `POST /api/generate { wish?, date }`. It can answer `422`; offer "Try again".
- **Log it:** buttons on each meal, `POST /api/meal-logs { entryId, status }` with `status` `eaten_as_planned`, `skipped`,
  or `modified` (also send `calories`, so ask roughly how much they ate). Logging the same meal again updates the earlier
  log, so the buttons can simply be changed later. "I ate something else" is `{ status: "ad_hoc", calories, mealType }`.
  The log response says what was stored; undo with `DELETE /api/meal-logs { id }`.
- Tapping the recipe opens `/recipes/<entry id>`.

### /plan
- `GET /api/plan?date=...` and draw the 7 days (a day can have more than one entry when `position` is above 0).
- "Plan a new week": `POST /api/plan { regenerate: true }` (ask for confirmation, it replaces the week).
- Per-day swap as on `/today`. Week navigation is the `date` query parameter.
- To show which meals were already logged (a tick or a strike-through), read `GET /api/meal-logs?from=<monday>&to=<sunday>`
  and match each log's `entryId` to a plan entry.

### /recipes/[id]  (use the **plan entry id**, not the recipe id)
- `GET /api/entries/:id` returns the recipe plus the user's own changes. Show:
  - `modifiedRecipe` instead of the recipe's ingredients and steps when it is not `null`;
  - `convertedSteps` instead of the steps when the list is not empty.
- **Convert for my equipment:** `POST /api/convert { entryId }`. When `available` is `false`, show the `note`
  and keep the original steps.
- **Change this recipe:** a text box, `POST /api/modify { entryId, request }`, and an "undo" button,
  `DELETE /api/modify { entryId }`. A `422` means the change could not be made safely: ask for different wording.
- **Swap an ingredient:** a button next to each ingredient, `POST /api/substitute { entryId, ingredient }`. Show up to
  3 swaps with their `note`. `quality: "rough"` means a weaker match, so label it. An empty list means "no close swap".
- **Save / like:** `POST /api/signals { recipeId, type: "favorite" }` (the recipe id is in the `recipe` object).
  Skipping or rating a meal uses the same route.
- Show allergens and diet tags from `recipe.allergens` and `recipe.diets`.

### /shopping-list
- `GET /api/shopping-list` (add `?weekStart=` for another week). `404` means no plan yet.
- Tick an item: `PATCH /api/shopping-list { itemId, checked }`. Update the UI immediately and undo it if the call fails.
- Quantities for dataset recipes are placeholders: show the name, and `mealCount` ("used in 3 meals") instead.

### /dashboard
- Weight: `GET /api/logs` for the history and `POST /api/logs { weightKg }` for a new weigh-in. The answer can include an
  `adjustment` (the calorie target changed): tell the user why, using its `reason`.
- Current target: `GET /api/profile`.
- **Planned versus actual:** `GET /api/adherence` returns everything for the charts (see "Meal logs and adherence" in
  [api.md](api.md)). Suggested charts: planned vs actual calories per day (bars from `days`), `followedRate` per week
  (line from `weeks`) with `avgWeightKg` beside it. Show `totals.followedRate` as "You followed your plan X% of the time"
  when it is not `null`. `adherenceVsWeight.r` is `null` until there are 3 weeks of data: show its `note` instead of a number.
- Days with nothing logged return zeros and `null` rates, never `NaN`, so charts can draw them as empty.

### Swap sheet (on /today)
- Open it with `POST /api/swap/options { entryId, request? }` (fast, no AI): up to 3 choices with a photo, calories and a one-line note.
  Show them, and a text box that calls the same route again with `request` to refresh the list.
- When the user taps one, `POST /api/swap { entryId, recipeId }`. A `422` means it is no longer available: refresh the list.

### Eaten today (on /today)
- `GET /api/meal-logs?from=<day>&to=<day>` for the selected day. Add up `calories` (skipped counts 0) and show it against `calorieTarget`.
- "Log other food": `POST /api/meal-logs { status: "ad_hoc", calories, mealType, date, note }`. Remove with `DELETE /api/meal-logs { id }`.
- Weigh-in: keep an input available at any time (`POST /api/logs { weightKg }`), and highlight it when the last weigh-in is 6 or more days old.

### Photos
- Use `recipe.imageUrl` when it is not `null`; otherwise draw an illustration. If the image fails to load, fall back to the illustration too.
- Credit Wikimedia Commons somewhere visible (settings or about).

### Recipes (browse all, and saved)
- The Recipes tab (route `/saved`) is the browser: a switch between **All recipes** and **Saved** (`saved=true`), a search box (`q`, send it after a short
  pause in typing), meal chips (`mealType`), sort chips (`sort`), and "Show more" (`offset` = how many are already shown). Ignore answers from an older search.
- The list only has safe recipes, so there is nothing to warn about; if a search finds nothing, say that allergens are never listed.
- Tapping a row opens the recipe (`GET /api/recipes/:id`, route `/recipes/saved/<id>` on the phone, `/saved/<id>` on the web) with two actions:
  **Use on a day** (pick a day, `POST /api/swap { entryId, recipeId }`, `422` = does not fit allergies or diet) and **I ate this**
  (`POST /api/meal-logs { status: "ad_hoc", recipeId, date, mealType }`, then the "How was it?" step).

### Saved recipes
- The heart calls `POST /api/favorites { recipeId }` / `DELETE /api/favorites { recipeId }`; start it filled when `recipe.isFavorite` is true.
- The saved list is `GET /api/favorites`; open one with `GET /api/recipes/:id` (it is a recipe, not a plan entry).

### Cooking with other equipment (on the recipe page)
- Show the appliance choices (the allowed equipment values) at all times, not only when the recipe lists equipment the user lacks.
  `POST /api/convert { entryId, equipment: [...] }`; `convertedForEquipment` says what the shown steps were written for.
  A "not convertible" answer comes back with `available: false`, the original steps and a `note`: show the note.

### Shopping list
- Show "to buy" as the items with `staple: false` that are not ticked; keep `staple: true` items in a separate "Pantry basics" group.
- Offer two views: **by aisle** (group by `aisle`, in the order the API returns) and **by recipe** (group items by each `usedIn` meal;
  an item appears under every meal that needs it, and ticking it ticks it everywhere).
- Hide `quantity` when `unit` is `"item"` (placeholder); show `usedIn` recipe names or "N meals" as the subtitle.

### Rating after eating (learning)
- After the user logs a meal as eaten (or changed), ask "How was it?" with three answers: Loved it (`POST /api/signals { recipeId, type: "rating", value: 5 }`),
  It was fine (send nothing), Not for me (`value: 1`). A failed rating must not block logging. Skips need no question.
- Show what was learned on Progress: `GET /api/signals` gives `affinity`; list the top positive tags as "You like" and the most negative as "Not your thing".

### Change a recipe in words, and create a recipe (AI)
- On the recipe page: `POST /api/modify { entryId, request }` (3 to 200 characters), then read the entry again; `modifiedRecipe.request` is what to show
  ("Your version: ...") with an **Undo** button (`DELETE /api/modify { entryId }`). If `modifiedRecipe.caloriesVerified` is `false`, say the original
  calories are shown. `422` means the change could not be made safely: ask for different wording.
- On Today: "Create a recipe" calls `POST /api/generate { wish?, date, mealType: "dinner" }` (5 to 25 seconds) and adds it as an extra meal that day.
  `429` is the daily limit or the AI limit; `422` means try again. Label recipes with `source: "ai"` as "AI-made".

### Saved recipe on a day
- From a saved recipe: show the week's days (`GET /api/plan`), then `POST /api/swap { entryId, recipeId }` for the chosen day. `422` means it does not
  fit the user's allergies or diet, so say so.

### Forgot password
- Web: `supabase.auth.resetPasswordForEmail(email, { redirectTo: "<web address>/reset-password" })`. The public `/reset-password` page lets the user pick a new password with `auth.updateUser`.
- Phone: `redirectTo` is `Linking.createURL("reset-password")`; the link opens the app on `reset-password.tsx`, which starts the recovery session from the link and calls `auth.updateUser`.
- Every redirect address must be allowed in the Supabase dashboard (Authentication → URL Configuration).

### Settings
- Edit answers by sending the whole body to `PUT /api/profile`. The calorie target changes only if body, goal or pace changed.
- Change password in the client with `supabase.auth.updateUser({ password })` after checking the current password with `signInWithPassword`.
- Delete account: `DELETE /api/account { confirm: "DELETE", password }`, then sign out locally.

## Mistakes to avoid

- Do not hide the `reason` from a swap or recommendation. It is a short sentence about why the recipe fits.
- Do not assume the AI worked: `fromAi: false` just means the app used its backup choice. The result is still valid.
- Do not cache the plan forever. After a swap, modify or regenerate, read it again.
- Do not store the user's allergies or diet in the browser. Read them from `/api/profile`.
- Add any new private page to `PROTECTED_PAGES` in `src/server/auth/routes.ts`.
- Meals can only be logged up to tomorrow (`400` otherwise), so do not offer a log button on days far in the future.
