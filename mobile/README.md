# Meal Planner: Expo phone app

React Native (Expo SDK 58, Expo Router) client for the same `/api` routes the web app uses.
Design reference: the "Adaptive AI Meal Planner (phone app)" canvas.

## Screens

| Screen | What it does |
| --- | --- |
| Login | Sign in or create an account (Supabase). |
| Quiz (4 steps) | Body, goal and pace, eating style and allergies, kitchen and cuisines. Shows the calorie target as it is computed. |
| Today | Week strip, the day's recipe with a photo, swap (pick from 3 options or describe what you want), log the meal, **Eaten so far** with a button to log other food, weight entry (always available, highlighted when a weekly weigh-in is due). |
| Recipe | Ingredients and method, **cook it a different way** (choose appliances and convert the steps), swap one ingredient, save with the heart, log the meal. |
| Shopping | The week's list, tick items, copy. |
| Progress | Weight trend, planned vs actual calories, meal log counts, tastes the planner learned. |
| Saved | Recipes you hearted (list, open, remove). |
| Settings | Edit body and goal, eating style and allergies, kitchen, cuisines; change password; sign out; delete account; medical notice and photo credits. |

## Run it on your phone (same Wi-Fi)

1. Install **Expo Go** on the phone.
2. In the repo root run the API so the phone can reach it:
   ```bash
   npm run dev:lan        # next dev on 0.0.0.0:3000
   ```
   Windows may ask to allow Node through the firewall: allow it on **Private** networks.
3. In `mobile/`:
   ```bash
   cp .env.example .env   # public Supabase URL + anon key, and your computer's LAN address
   npm install
   npx expo start
   ```
   Scan the QR code with Expo Go (Android) or the Camera app (iOS).

`EXPO_PUBLIC_*` values are bundled into the app, so only the **public** Supabase URL and anon key go here.
Never put the service-role key, database URLs or the Gemini key in `mobile/.env`.

If Expo Go says the project can't run because you are signed in on the phone but not in the CLI, run `npx expo login`
with the same account, or sign out in Expo Go.

## How login works

The app signs in with the Supabase client (session kept in AsyncStorage) and sends the access token as
`Authorization: Bearer <token>` on every API call. The API checks it with Supabase in
`src/server/auth/require-user.ts`, the same way it checks the web cookie. A 401 signs the user out.

## Checks

```bash
npm run typecheck                      # tsc
npx expo-doctor
npx expo export --platform android     # proves the bundle builds
npx expo start --web                   # the app in a browser, handy for quick visual checks
```

## Deploying later (EAS)

`npx eas-cli@latest build --profile preview --platform android` builds an installable APK once an EAS account
and a hosted API URL (`EXPO_PUBLIC_API_URL`) exist. The bundle ids are in `app.json`.

## Not built yet

- Photos are of the *dish* (matched by recipe name), not of the exact recipe; about a quarter of dinner recipes have no match and show an illustration.
- "Change this recipe in words" and "generate a new recipe" have API routes but no screen yet.
- Saved recipes cannot be added to a day of the plan directly.
- A reset-password screen for forgotten passwords (the email link needs a page to land on).
