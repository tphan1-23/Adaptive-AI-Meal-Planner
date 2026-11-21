"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SavedRecipe } from "@/lib/api-types";
import { niceName } from "@/lib/vocab";
import BowlArt from "@/components/BowlArt";
import { BottomNav, Button, ErrorText, Spinner } from "@/components/ui";

// Tags that say little about the dish; skip them in the subtitle.
const GENERIC = new Set(["main-dish", "dinner", "course", "time-to-make", "preparation", "occasion", "cuisine", "north-american", "dietary", "equipment", "easy", "healthy", "main-ingredient", "meat", "weeknight", "60-minutes-or-less", "30-minutes-or-less", "15-minutes-or-less", "4-hours-or-less"]);

export default function SavedPage() {
  const [items, setItems] = useState<SavedRecipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ favorites: SavedRecipe[] }>("/api/favorites")).favorites);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unsave(r: SavedRecipe) {
    setItems((list) => (list ? list.filter((x) => x.id !== r.id) : list)); // remove right away, restore if it fails
    try {
      await api("/api/favorites", { method: "DELETE", json: { recipeId: r.id } });
    } catch {
      load();
    }
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-14">
        <div>
          <h1 className="mb-1.5 text-[34px] font-semibold leading-none tracking-tight">Saved</h1>
          <p className="text-[14px] text-ink-muted">Recipes you&apos;ve hearted. Saving also teaches the planner your tastes.</p>
        </div>

        {!items && !error && <div className="flex justify-center py-16"><Spinner /></div>}
        {error && (
          <div>
            <ErrorText>{error}</ErrorText>
            <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
          </div>
        )}
        {items && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <p className="text-[17px] font-semibold">Nothing saved yet</p>
            <p className="text-center text-[14px] text-ink-muted">Tap the heart on any recipe to keep it here.</p>
            <Link href="/today" className="mt-3 flex h-[50px] w-full items-center justify-center rounded-full border border-ink font-semibold">Go to Today</Link>
          </div>
        )}
        {items?.map((r) => {
          const sub = r.tags.filter((t) => !GENERIC.has(t)).slice(0, 2).map(niceName).join(" · ");
          return (
            <div key={r.id} className="flex items-center gap-3.5">
              <Link href={`/saved/${r.id}`} aria-label={`Open ${r.name}`} className="flex min-h-[72px] flex-1 items-center gap-3.5">
                <span className="flex h-[72px] w-[72px] flex-none items-center justify-center overflow-hidden rounded-[20px] bg-surface"><BowlArt size={52} name={r.name} tags={r.tags} imageUrl={r.imageUrl} /></span>
                <span className="flex-1">
                  <span className="block text-[16px] font-medium">{r.name}</span>
                  <span className="block text-[13px] text-ink-muted">{Math.round(r.calories)} kcal{sub ? ` · ${sub}` : ""}</span>
                </span>
              </Link>
              <button type="button" aria-label={`Remove ${r.name} from saved`} onClick={() => unsave(r)} className="flex h-11 w-11 items-center justify-center">
                <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="#D92D20" stroke="#D92D20" strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
              </button>
            </div>
          );
        })}
      </main>
      <BottomNav />
    </>
  );
}
