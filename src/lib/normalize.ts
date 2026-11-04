/**
 * One place for "treat these as the same" rules, so the database never ends up with
 * two spellings of one thing. Passwords are NOT touched here: they stay case-sensitive.
 */

/** Roll numbers are stored and compared in upper case: "23mca101", "23Mca101" and "23MCA101" are one student. */
export function normalizeRollNo(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** True for "all", "ALL", " All ", "aLL" and so on. */
export function isAllValue(input: string): boolean {
  return input.trim().toLowerCase() === "all";
}

/**
 * Reads the recruiter's "Specialization" box. Comma separated, stored in upper case.
 * Typing "All" in any casing means no restriction, which is stored as an empty list.
 */
export function parseSpecializationList(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some(isAllValue)) return [];
  return Array.from(new Set(parts.map((s) => s.toUpperCase())));
}

/**
 * Tidies a typed name: "aman verma" and "AMAN VERMA" become "Aman Verma".
 * Words that already mix cases (McDonald, DeSouza) are left alone.
 */
export function tidyName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => {
      if (w === w.toLowerCase() || w === w.toUpperCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      return w;
    })
    .join(" ");
}
