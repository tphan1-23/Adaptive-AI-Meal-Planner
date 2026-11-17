export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD -> Date at UTC midnight (what Prisma's @db.Date columns expect). */
export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Date -> YYYY-MM-DD (UTC). */
export function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/** The Monday of the week containing this date. Plans always start on a Monday. */
export function mondayOf(iso: string): string {
  const d = toDate(iso);
  const sinceMonday = (d.getUTCDay() + 6) % 7; // Sunday = 0 -> 6
  return addDays(iso, -sinceMonday);
}

export function todayIso(now: Date = new Date()): string {
  return isoOf(now);
}

/** True for a real calendar date, not just something shaped like one ("2026-02-31"). */
export function isValidIsoDate(iso: string): boolean {
  return ISO_DATE.test(iso) && isoOf(toDate(iso)) === iso;
}
