"use client";

import { useState } from "react";
import { OFFER_TYPES, OFFER_TYPE_LABEL, OFFER_TYPE_HELP, MAX_BOND_MONTHS, type OfferTypeValue } from "@/lib/offerRules";

export interface OfferFormDefaults {
  offerType?: string | null;
  offerCtcLpa?: number | null;
  offerStipend?: number | null;
  bondMonths?: number | null;
  bondNote?: string | null;
  joiningDate?: string; // yyyy-mm-dd
  offerMessage?: string | null;
}

const inputCls = "mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink";

/**
 * The offer boxes shared by "Request offer", "Edit offer" and "Convert to full-time":
 * type, package (CTC for jobs, stipend for internships), joining date, bond, and the message.
 * The names match what readOfferTerms() reads on the server, which re-checks every value.
 */
export function OfferFormFields({
  defaults,
  forceType,
  minDate,
}: {
  defaults?: OfferFormDefaults;
  /** For "Convert to full-time": the type is fixed, so no type box is shown. */
  forceType?: OfferTypeValue;
  /** Earliest joining date the browser should allow (the server checks again). */
  minDate: string;
}) {
  const initial = (OFFER_TYPES as readonly string[]).includes(defaults?.offerType ?? "") ? (defaults!.offerType as OfferTypeValue) : "FULL_TIME";
  const [type, setType] = useState<OfferTypeValue>(forceType ?? initial);
  const internship = type === "INTERNSHIP";

  return (
    <>
      {forceType ? (
        <input type="hidden" name="offerType" value={forceType} />
      ) : (
        <label className="block text-xs text-muted">
          Offer type
          <select
            name="offerType"
            value={type}
            onChange={(e) => setType(e.target.value as OfferTypeValue)}
            className={inputCls}
          >
            {OFFER_TYPES.map((t) => (
              <option key={t} value={t}>
                {OFFER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="block mt-1 text-[11px] leading-snug">{OFFER_TYPE_HELP[type]}</span>
        </label>
      )}

      {internship ? (
        <label className="block text-xs text-muted">
          Stipend per month (₹)
          <input
            name="offerStipend"
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={500000}
            step={1}
            defaultValue={defaults?.offerStipend ?? undefined}
            placeholder="e.g. 25000 (enter 0 if unpaid)"
            className={inputCls}
          />
        </label>
      ) : (
        <label className="block text-xs text-muted">
          CTC (lakh per annum)
          <input
            name="offerCtcLpa"
            type="number"
            inputMode="decimal"
            required
            min={0.01}
            max={200}
            step="any"
            defaultValue={defaults?.offerCtcLpa ?? undefined}
            placeholder="e.g. 12 or 12.5"
            className={inputCls}
          />
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-muted">
          Joining date (optional)
          <input name="joiningDate" type="date" min={minDate} defaultValue={defaults?.joiningDate} className={inputCls} />
        </label>
        <label className="block text-xs text-muted">
          Joining bond, in months (optional)
          <input
            name="bondMonths"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_BOND_MONTHS}
            step={1}
            defaultValue={defaults?.bondMonths ?? undefined}
            placeholder="Leave empty if there is no bond"
            className={inputCls}
          />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Bond details (optional, for example the amount)
        <input name="bondNote" maxLength={200} defaultValue={defaults?.bondNote ?? undefined} placeholder="e.g. ₹1,00,000 if you leave early" className={inputCls} />
      </label>

      <label className="block text-xs text-muted">
        Message to the candidate (optional). Press Enter to start a new line.
        <textarea
          name="offerMessage"
          rows={6}
          maxLength={2000}
          defaultValue={defaults?.offerMessage ?? undefined}
          placeholder={"Dear candidate,\n\nWe are happy to offer you the role of ...\n\nLocation: ...\n\nRegards,"}
          className={`${inputCls} leading-relaxed`}
        />
      </label>
    </>
  );
}
