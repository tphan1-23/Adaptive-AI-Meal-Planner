# Adaptive AI Meal Planner

A responsive web app that builds weekly meal plans from a verified recipe database,
adapts daily calorie targets to the user's weigh-ins, and uses AI only as a reasoning
layer (ranking, step conversion for kitchen equipment, natural-language swaps).

CSCI 4397 - Software Engineering with AI.

## Team

| Name | Role | Owns |
| --- | --- | --- |
| Anya Kim | Frontend & interaction | `src/app` pages (onboarding, weekly plan grid, recipe detail, shopping list, login, dashboard), `src/components`, `src/lib` |
| Thanh Phan | Backend & data | `scripts/` (Food.com import), `prisma/`, `src/server/db`, `src/server/profile` (TDEE, weekly weigh-in), `src/server/shopping-list`, `src/server/adherence` |
| Manuel Modesto | AI integration & full-stack lead | `src/server/planning` (plan generation, filters, ranking, substitution), `src/server/ai` (swap and convert), `src/server/auth`, review and end-to-end wiring |

## Stack

Next.js 14 + React + Tailwind, Next.js API routes, Supabase (Postgres + Auth) via Prisma,
Gemini free tier (server-side only), hosted on Vercel.

## Docs

- [docs/architecture.md](docs/architecture.md): how the system fits together
- [docs/api.md](docs/api.md): every API endpoint with request and response shapes

## Getting started

```bash
git clone https://github.com/tphan1-23/Adaptive-AI-Meal-Planner.git
cd Adaptive-AI-Meal-Planner
npm install
cp .env.example .env     # ask Thanh for the Supabase values (never commit this file)
npx prisma generate
npm run dev
```

The database tables already exist in the shared Supabase project, so you do not need to
run migrations. Run `npx prisma migrate dev` only after changing `prisma/schema.prisma`.

Each person uses their own `GEMINI_API_KEY` (free at aistudio.google.com).

## Rules

- Never commit `.env` or any keys.
- The browser only talks to our API routes, never to Gemini or Supabase tables directly.
- Every API route must verify the logged-in user and return only that user's data.
- Allergies, diet filters and calorie math are done in code. AI output is always validated.

## Layout

```
src/app/        pages + API routes
src/components/ shared UI
src/server/     backend logic (profile, planning, ai, shopping-list, adherence, auth, db)
prisma/         schema + migrations
scripts/        one-time dataset imports
tests/          mirrors src/server
```
