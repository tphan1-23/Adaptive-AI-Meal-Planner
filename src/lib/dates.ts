// Local-date helpers. Dates travel as "YYYY-MM-DD"; noon avoids time-zone day shifts.
const pad = (n: number) => String(n).padStart(2, "0");

export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The API sends "2026-11-16" or "2026-11-16T00:00:00.000Z"; only the date part matters. */
export const parseDay = (s: string) => new Date(`${String(s).slice(0, 10)}T12:00:00`);

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export const dayKey = (s: string) => String(s).slice(0, 10);
