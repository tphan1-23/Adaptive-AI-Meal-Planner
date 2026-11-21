# Security review

Reviewed on 2026-11-20 against `main` after PR #13, using the code, the real database and real Supabase logins.
This page records what was checked, what was fixed, and what is still open, so the team can decide on the open items.

## What is in good shape

| Area | Result |
| --- | --- |
| Secrets in git | None in any commit on any branch (searched for Supabase keys, Gemini keys, JWTs and database URLs). `.env` was never committed and is ignored. |
| Login check on every route | All 15 route files (28 handlers) go through `withUser`. Logged out always gives `401`. |
| Each user sees only their own data | Every database query on user data is tied to the logged-in user's id (checked query by query). A second real user got `404` on the first user's entries, plan, meal logs, shopping list and private AI recipes. The app connects with a database role that bypasses row-level security, so this scoping in code is the only protection, and it holds. |
| Database exposed through Supabase's own API | All 12 tables in `public` have row-level security on, there are no open policies, and the public roles (`anon`, `authenticated`) have no grants. The public key alone cannot read anything. |
| Keys in the browser | Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public. The Gemini key is not used anywhere in `src`. The service-role key is used in exactly one server-only file, `src/server/auth/admin.ts`, for deleting an account; it is never sent to a client and never goes in `mobile/.env` or a `NEXT_PUBLIC_` variable. |
| Phone app login (bearer token) | The phone app sends `Authorization: Bearer <Supabase access token>`. `requireUser` checks it with Supabase (`getUser(token)`) on every request, exactly like the web cookie, so a forged, malformed or expired token gives `401` (covered by `tests/e2e/api-e2e.ts` and `tests/server/bearer.test.ts`). The cross-site guard does not need to apply to it: a bearer token is not sent automatically by a browser, so it cannot be abused by another site. |
| Account deletion | `DELETE /api/account` needs the current password (checked with Supabase) and the word `DELETE`. It removes the user's data first (everything cascades from `Profile`), then the login. `tests/e2e/api-e2e.ts` checks that a wrong password deletes nothing and that nothing is left afterwards. |
| Login handling | The session is verified with `getUser()` (checked with Supabase, not trusted from the cookie). Forged or corrupted cookies count as logged out. The post-login redirect goes through `safeNextPath`, so it cannot be turned into an open redirect. |
| Injection | The one raw SQL query is a fixed template with no user input. All other queries go through Prisma. No `eval`, no `dangerouslySetInnerHTML`. |
| AI misuse | Free text from users reaches Gemini only as quoted data. The AI's answer is validated in code: the pick must be in the shortlist, allergens and diet are re-checked on the real ingredient names, nutrition is computed, never taken from the AI. AI calls are limited per user. Errors from the AI are never shown to the user. |
| Error messages | Errors are fixed strings. Stack traces and database errors are not returned. |

## Fixed in this review

1. **No limit on request size.** The `zod` advisory (memory use on very large inputs) applies to us. API requests with a body over 100 KB now get `413` before any code reads them, and a body of unknown length gets `411`. The profile lists (cuisines, allergies, equipment) also have a maximum length.
2. **No check against cross-site requests.** Login cookies are `SameSite=Lax`, which already stops browsers sending them on cross-site `POST`s. A second layer now refuses any `POST`, `PUT`, `PATCH` or `DELETE` whose `Origin` is another site or whose `Sec-Fetch-Site` is `cross-site` (`403`). Scripts and tools, which send no `Origin`, are unaffected.
3. **No security headers.** Added `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and `Strict-Transport-Security`, removed `X-Powered-By`, and set `Cache-Control: no-store` on every API answer so a cache never keeps one user's data.
4. **Leftover test data.** Two test profiles from an interrupted test run were still in the shared database. They were identified by their exact test values and deleted.

All of this was checked against the running app with a real login: 23 checks, including a cross-site attack that must change nothing, an oversized body, and normal use still working. The logic is in `src/server/auth/request-guard.ts` and runs in `src/middleware.ts`.

## Open items (decisions for the team)

**A. Dependencies.** `npm audit` reports a critical advisory group on `next` 14.2.35 and a high one on `zod`.
- Most `next` advisories do not apply because we do not use what they target: the image optimizer, server actions, i18n routing, rewrites, WebSocket upgrades, or self-hosting on Windows. Hosting on Vercel also covers some of the rest.
- The fix is Next 16, a major upgrade. Do it **after the pages are finished**, then re-run the tests. Not in the middle of frontend work.
- `zod` 3.x has the memory advisory. The request-size cap above is the mitigation; the fix needs zod 4, also a major change.

**B. Recipe tags cannot be trusted alone.** About 1% of recipes contain an allergen ingredient their `allergens` tag misses (conch, crabmeat, pollock, soymilk, gruyere, pita), and 3 to 9% of recipes tagged vegetarian, vegan or gluten-free contain a banned ingredient (bacon in a "vegetarian" soup, butter in a "vegan" dish). The app re-checks the real ingredient names for plans, recommendations and swaps (PR #10), but the import should be fixed at the source (Thanh).

**C. Abuse of sign-up and of the AI quota.** Anyone can create an account, and all accounts share one small Gemini free-tier quota. The per-user AI limit is kept in memory, which does not hold across separate serverless instances on Vercel. For the demo this is fine. For anything public: turn on email confirmation and a captcha for sign-up in Supabase, and add per-address limits (Vercel Firewall).

**D. Health data is not tied to the account (partly fixed).** `Profile` has no foreign key to `auth.users`, so deleting a user in the Supabase dashboard still leaves their weight, diet and allergies in our tables. Deleting through the app (`DELETE /api/account`, Settings screen) now removes both. To make the dashboard path safe too, add a foreign key with `on delete cascade` in a hand-written migration (Prisma cannot model the `auth` schema, so test it first).

**G. Dish photos come from Wikimedia Commons.** Photos are free-licensed but each has its own license and author; the app credits Wikimedia Commons under Settings, About, and `dish-photos.json` records each source page. The addresses are fixed in the repo, so the app makes no outside request when serving recipes. Only dish names (not user data) are sent to Wikipedia, when `npm run build:dish-photos` is run.

**E. No Content-Security-Policy yet.** A good CSP has to be written together with the finished pages (Next.js uses inline scripts, so a strict policy needs nonces). Add it once the frontend is stable.

**F. `GET /api/shopping-list` writes.** It rebuilds the list's rows when called. It is safe (same result every time, and scoped to the user), but a read that writes should ideally be a `POST`. Low priority.

## Rules for the frontend

- Show recipe, AI and user text as plain text. Never use `dangerouslySetInnerHTML`, and do not render AI text as Markdown with links unless it is sanitized.
- Never put a key in a `NEXT_PUBLIC_` variable except the Supabase URL and anon key.
- After sign-in, redirect with `safeNextPath(next)`, never to a raw `next` value.
- Do not store allergies, diet or weight in the browser (`localStorage`, cookies). Read them from `/api/profile`.
- Add any new private page to `PROTECTED_PAGES` in `src/server/auth/routes.ts`.
- Send changes (`POST`, `PUT`, `PATCH`, `DELETE`) with `fetch` from the same site, not from forms on other sites.

## Supabase dashboard checklist

These live in the Supabase settings, so they cannot be checked from the code. Someone with access should confirm them:

- [ ] **Authentication > URL Configuration:** the Site URL and the Redirect URLs list only the real app URL(s) and `http://localhost:3000`, no wildcards.
- [ ] **Authentication > Providers:** only the sign-in methods the app uses are switched on. Decide whether anonymous sign-ins are off.
- [ ] **Authentication > Sign In / Up:** email confirmation is on (see item C), and the password rules are not weaker than the default.
- [ ] **Authentication > Rate Limits:** left at or below the defaults.
- [ ] **Project Settings > API:** "Exposed schemas" is only `public` (it is safe because every table has row-level security and no policy), and the service-role / secret key is only in server environment variables.
- [ ] **Keys:** if a key was ever pasted in a chat, a ticket or a screenshot, rotate it. Each person uses their own `GEMINI_API_KEY`.
- [ ] **Database:** the database password is not shared outside the team, and `DATABASE_URL` and `DIRECT_URL` exist only in `.env` and in Vercel's settings.

## How to re-check

- `npm test` runs the unit tests, including the request guard, cookie and redirect handling.
- `npm run test:e2e` runs Thanh's end-to-end script against the real database.
- `npm audit --omit=dev` lists dependency advisories.
- A cross-user check: sign in as two test users and request one user's entry id as the other (expect `404`).

## Hosting on Vercel (free Hobby plan)
- The web app and API run on Vercel; `vercel.json` sets the region next to the database and gives the API routes a 60-second limit (the AI calls take 5 to 25 seconds).
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`, `DIRECT_URL`) are stored as sensitive environment variables in the Vercel project, never in the repo. The two `NEXT_PUBLIC_` values are public by design.
- Deployed from the command line (`vercel deploy --prod`), not connected to GitHub, so a push never deploys by itself.
- In Supabase (Authentication, URL Configuration) the deployed address and its `/reset-password` page must be allowed redirect URLs.
- The phone app uses the deployed address as `EXPO_PUBLIC_API_URL` in `mobile/.env`.
