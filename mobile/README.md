# Meal Planner: Expo phone app

React Native (Expo SDK 58, Expo Router) client for the same `/api` routes the web app uses.
Design reference: the "Adaptive AI Meal Planner (phone app)" canvas.

## Run it on your phone (LAN)

1. Phone and computer on the same Wi-Fi. Install **Expo Go** on the phone.
2. In the repo root run the API so the phone can reach it:
   ```bash
   npm run dev:lan        # next dev on 0.0.0.0:3000
   ```
   Windows may ask to allow Node through the firewall: allow it on **Private** networks.
3. In `mobile/`:
   ```bash
   cp .env.example .env   # fill in the public Supabase URL + anon key, and your PC's LAN IP
   npm install
   npx expo start
   ```
   Scan the QR code with Expo Go (Android) or the Camera app (iOS).

`EXPO_PUBLIC_*` values are bundled into the app, so only the **public** Supabase URL and anon key go here.
Never put the service-role key, database URLs or the Gemini key in `mobile/.env`.

## How login works

The app signs in with the Supabase client (session kept in AsyncStorage) and sends the access token as
`Authorization: Bearer <token>` on every API call. The API checks it with Supabase in
`src/server/auth/require-user.ts`, the same way it checks the web cookie.

## Checks

```bash
npm run typecheck      # tsc
npx expo-doctor
npx expo export --platform android   # proves the bundle builds
```

## Deploying later (EAS)

`npx eas-cli@latest build --profile preview --platform android` builds an installable APK once an EAS account
and a hosted API URL (`EXPO_PUBLIC_API_URL`) exist. The bundle ids are in `app.json`.

## Not built yet

- Recipe photos: dataset recipes have none. `BowlArt` shows a photo when the API sends an `imageUrl`.
- The swap sheet applies one best match; the design shows a list of three options (needs a new API route).
- Ingredient swap and "change this recipe" (API routes exist; no screen in the design).
