/**
 * Exact rules for offer details. Nothing here calls the AI.
 *
 * An offer has a type (Internship, PPO or Full-time), a package stored as a NUMBER (CTC in lakh per
 * annum for Full-time and PPO, stipend in rupees per month for an Internship), an optional joining
 * bond and an optional joining date. Everything is checked here, on the server side of the app, so a
 * crafted request can't save a negative CTC, a bond of 900 months or a joining date in the past.
 */

import { fmtDay } from "./format";

export const OFFER_TYPES = ["INTERNSHIP", "PPO", "FULL_TIME"] as const;
export type OfferTypeValue = (typeof OFFER_TYPES)[number];

export const OFFER_TYPE_LABEL: Record<OfferTypeValue, string> = {
  INTERNSHIP: "Internship",
  PPO: "PPO",
  FULL_TIME: "Full-time",
};

export const OFFER_TYPE_HELP: Record<OfferTypeValue, string> = {
  INTERNSHIP: "A fixed-period internship with a monthly stipend. It can be converted to a full-time offer later.",
  PPO: "Pre-placement offer: a job offer made because of an internship or earlier performance.",
  FULL_TIME: "A regular job offer.",
};

export function isOfferType(v: unknown): v is OfferTypeValue {
  return typeof v === "string" && (OFFER_TYPES as readonly string[]).includes(v);
}

export function offerTypeLabel(v: string | null | undefined): string {
  return isOfferType(v) ? OFFER_TYPE_LABEL[v] : OFFER_TYPE_LABEL.FULL_TIME;
}

/* ---------- Limits (one place, so the form hints and the checks always agree) ---------- */
export const MAX_CTC_LPA = 200;
export const MAX_STIPEND = 500_000;
export const MAX_BOND_MONTHS = 60;
export const MAX_YEARS_AHEAD = 3;
export const MAX_DEFERRAL_MONTHS = 18;

/* ---------- Dates ---------- */

/** Today's calendar day in India, as yyyy-mm-dd. The app runs for one Indian college. */
export function todayYmd(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** "2026-11-08" -> a Date at midnight UTC (what a DATE column stores). Null for anything that is not a real day. */
export function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A DATE value read back from the database, shown as "8 Nov 2026". */
export function fmtJoining(d: Date | string | null | undefined): string {
  if (!d) return "";
  const ymd = typeof d === "string" ? d.slice(0, 10) : toYmd(d);
  return fmtDay(ymd);
}

export function addMonthsYmd(ymd: string, months: number): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  return toYmd(out);
}

/* ---------- Reading and checking the offer form ---------- */

export interface OfferTerms {
  offerType: OfferTypeValue;
  offerCtcLpa: number | null;
  offerStipend: number | null;
  bondMonths: number | null;
  bondNote: string | null;
  joiningDate: Date | null;
}

export interface RawOfferTerms {
  offerType?: string;
  ctc?: string;
  stipend?: string;
  bondMonths?: string;
  bondNote?: string;
  joiningDate?: string;
}

function parseNumber(raw: string | undefined): number | null {
  const t = (raw ?? "").trim().replace(/,/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

/**
 * Turns what the recruiter typed into checked offer details, or throws an error whose message is
 * safe to show. `forceType` is used by "Convert to full-time", where the type is not a choice.
 */
export function parseOfferTerms(raw: RawOfferTerms, opts: { forceType?: OfferTypeValue; now?: Date } = {}): OfferTerms {
  const type = opts.forceType ?? (raw.offerType as string | undefined);
  if (!isOfferType(type)) throw new Error("Please choose the offer type: Internship, PPO or Full-time.");

  let offerCtcLpa: number | null = null;
  let offerStipend: number | null = null;

  if (type === "INTERNSHIP") {
    const n = parseNumber(raw.stipend);
    if (n === null) throw new Error("Please enter the stipend per month in rupees. Enter 0 if the internship is unpaid.");
    if (Number.isNaN(n) || !Number.isInteger(n)) throw new Error("The stipend must be a whole number of rupees per month, like 25000.");
    if (n > MAX_STIPEND) throw new Error(`The stipend can't be more than ₹${MAX_STIPEND.toLocaleString("en-IN")} per month.`);
    offerStipend = n;
  } else {
    const n = parseNumber(raw.ctc);
    if (n === null) throw new Error("Please enter the CTC in lakh per annum, like 12 or 12.5.");
    if (Number.isNaN(n)) throw new Error("The CTC must be a number in lakh per annum, like 12 or 12.5.");
    if (n <= 0) throw new Error("The CTC must be more than 0 lakh per annum.");
    if (n > MAX_CTC_LPA) throw new Error(`The CTC can't be more than ${MAX_CTC_LPA} lakh per annum.`);
    offerCtcLpa = Math.round(n * 100) / 100;
  }

  let bondMonths: number | null = null;
  let bondNote: string | null = null;
  const bm = parseNumber(raw.bondMonths);
  if (bm !== null) {
    if (Number.isNaN(bm) || !Number.isInteger(bm)) throw new Error("The bond length must be a whole number of months. Leave it empty if there is no bond.");
    if (bm > MAX_BOND_MONTHS) throw new Error(`The bond can't be longer than ${MAX_BOND_MONTHS} months.`);
    if (bm > 0) {
      bondMonths = bm;
      bondNote = (raw.bondNote ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    }
  }

  let joiningDate: Date | null = null;
  const jd = (raw.joiningDate ?? "").trim();
  if (jd) {
    const parsed = parseYmd(jd);
    if (!parsed) throw new Error("Please pick a valid joining date.");
    const today = todayYmd(opts.now);
    if (jd < today) throw new Error("The joining date can't be in the past.");
    if (jd > addMonthsYmd(today, MAX_YEARS_AHEAD * 12)) throw new Error(`The joining date can't be more than ${MAX_YEARS_AHEAD} years away.`);
    joiningDate = parsed;
  }

  return { offerType: type, offerCtcLpa, offerStipend, bondMonths, bondNote, joiningDate };
}

/** Reads the offer fields from a submitted form. */
export function readOfferTerms(fd: FormData, opts: { forceType?: OfferTypeValue; now?: Date } = {}): OfferTerms {
  const get = (k: string) => String(fd.get(k) ?? "");
  return parseOfferTerms(
    {
      offerType: get("offerType"),
      ctc: get("offerCtcLpa"),
      stipend: get("offerStipend"),
      bondMonths: get("bondMonths"),
      bondNote: get("bondNote"),
      joiningDate: get("joiningDate"),
    },
    opts
  );
}

/* ---------- Showing an offer ---------- */

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}

/** "12 LPA", "12.5 LPA" or "₹25,000 per month". Also stored in Application.offerPackage, so older screens keep working. */
export function formatPackage(t: Pick<OfferTerms, "offerType" | "offerCtcLpa" | "offerStipend">): string {
  if (t.offerType === "INTERNSHIP") {
    if (t.offerStipend == null) return "";
    return t.offerStipend === 0 ? "Unpaid internship" : `₹${t.offerStipend.toLocaleString("en-IN")} per month`;
  }
  return t.offerCtcLpa == null ? "" : `${trimNumber(t.offerCtcLpa)} LPA`;
}

export function formatBond(months: number | null | undefined, note?: string | null): string {
  if (!months) return "No bond";
  return `${months}-month bond${note ? ` (${note})` : ""}`;
}

export interface OfferView {
  offerType?: string | null;
  offerPackage?: string | null;
  offerCtcLpa?: number | null;
  offerStipend?: number | null;
  bondMonths?: number | null;
  bondNote?: string | null;
  joiningDate?: Date | string | null;
  convertedFromInternship?: boolean | null;
}

/** The package to show: the number if we have it, else the text the recruiter typed for an older offer. */
export function packageText(o: OfferView): string {
  const type = isOfferType(o.offerType) ? o.offerType : "FULL_TIME";
  const fromNumber = formatPackage({ offerType: type, offerCtcLpa: o.offerCtcLpa ?? null, offerStipend: o.offerStipend ?? null });
  return fromNumber || o.offerPackage || "";
}

/** The short line under an offer: "Full-time · 12 LPA · 12-month bond · Joining 5 Jan 2027". */
export function offerSummaryParts(o: OfferView): string[] {
  const parts: string[] = [offerTypeLabel(o.offerType)];
  const pkg = packageText(o);
  if (pkg) parts.push(pkg);
  // Older offers have no bond information at all, so only mention a bond when one was recorded.
  if (o.bondMonths) parts.push(formatBond(o.bondMonths, o.bondNote));
  if (o.joiningDate) parts.push(`Joining ${fmtJoining(o.joiningDate)}`);
  if (o.convertedFromInternship) parts.push("Converted from internship");
  return parts;
}

/* ---------- Numbers for the dashboard ---------- */

/**
 * Older offers were typed as text ("12 LPA"). To include them in the package statistics we read a
 * plain "<number> LPA / lakh" out of the text. Ranges ("10-12 LPA") and anything unclear return null
 * rather than a guess. Nothing is written back to the database.
 */
export function legacyLpa(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\d\s*(?:-|–|to)\s*\d/.test(t)) return null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:lpa|l\.p\.a|lakhs?|lacs?)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= MAX_CTC_LPA ? n : null;
}

/** CTC in lakh per annum for an offer, or null for internships and for offers with no readable number. */
export function effectiveCtcLpa(o: { offerType?: string | null; offerCtcLpa?: number | null; offerPackage?: string | null }): number | null {
  if (o.offerType === "INTERNSHIP") return null;
  return o.offerCtcLpa ?? legacyLpa(o.offerPackage);
}

/* ---------- Deferral ---------- */

export interface DeferralCheck {
  ok: boolean;
  message?: string;
  newDate?: Date;
  reason?: string;
}

/**
 * A deferral asks to move the joining date LATER, by a reason the student writes. The new date must be
 * after the current joining date (or after today when none is recorded) and not more than 18 months away.
 */
export function checkDeferralRequest(
  input: { reason: string; newDate: string },
  current: { joiningDate: Date | string | null | undefined },
  now: Date = new Date()
): DeferralCheck {
  const reason = input.reason.replace(/\r\n/g, "\n").trim().slice(0, 1000);
  if (reason.length < 10) return { ok: false, message: "Please explain the reason in a sentence or two (at least 10 characters)." };

  const parsed = parseYmd(input.newDate.trim());
  if (!parsed) return { ok: false, message: "Please pick the new joining date you are asking for." };

  const today = todayYmd(now);
  const current_ = current.joiningDate ? (typeof current.joiningDate === "string" ? current.joiningDate.slice(0, 10) : toYmd(current.joiningDate)) : null;
  const floor = current_ && current_ > today ? current_ : today;
  const newYmd = toYmd(parsed);
  if (newYmd <= floor) {
    return {
      ok: false,
      message: current_ && current_ > today ? "The new date must be later than your current joining date." : "The new date must be after today.",
    };
  }
  if (newYmd > addMonthsYmd(today, MAX_DEFERRAL_MONTHS)) {
    return { ok: false, message: `The new date can't be more than ${MAX_DEFERRAL_MONTHS} months away.` };
  }
  return { ok: true, newDate: parsed, reason };
}
