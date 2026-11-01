/**
 * Phone numbers are stored in one normalized form so "98765 43210",
 * "+91-98765-43210" and "09876543210" all match the same account.
 * Format: "+" + country code + number. A bare 10-digit number is assumed Indian (+91).
 * Returns null if the input isn't a plausible phone number.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^\+?[\d\s\-()]+$/.test(raw)) return null;
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");

  if (!hasPlus) {
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1); // 0 trunk prefix
    if (digits.length === 10) digits = "91" + digits; // default to India
    else if (digits.length === 12 && digits.startsWith("91")) { /* already has country code */ }
    else return null;
  }
  if (digits.length < 11 || digits.length > 15) return null;
  return "+" + digits;
}
