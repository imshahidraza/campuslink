// Fixed locale + timezone so server and browser render identical text
// (prevents React hydration mismatches). Single college, India.
const TZ = "Asia/Kolkata";
const LOC = "en-IN";
type D = Date | string | number;

export const fmtDate = (d: D) =>
  new Date(d).toLocaleDateString(LOC, { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

export const fmtTime = (d: D) =>
  new Date(d).toLocaleTimeString(LOC, { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (d: D) =>
  new Date(d).toLocaleString(LOC, { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** A plain calendar day such as "2026-11-08", shown the same everywhere regardless of timezone. */
export const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(LOC, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
