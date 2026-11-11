/**
 * Shared pieces for changing an offer's state in the database. Kept out of the "use server" action
 * files because those may only export actions.
 */
import { formatPackage, type OfferTerms } from "./offerRules";

/** The offer details to save, from the checked form values. offerPackage keeps a readable text copy for older screens. */
export function termsData(t: OfferTerms) {
  return {
    offerType: t.offerType,
    offerCtcLpa: t.offerCtcLpa,
    offerStipend: t.offerStipend,
    bondMonths: t.bondMonths,
    bondNote: t.bondNote,
    joiningDate: t.joiningDate,
    offerPackage: formatPackage(t),
  };
}

/** Wipes the deferral and reminder fields. Used whenever a fresh offer replaces an old one. */
export const FRESH_OFFER_STATE = {
  convertedFromInternship: false,
  convertedAt: null,
  deferralStatus: null,
  deferralReason: null,
  deferralRequestedDate: null,
  deferralRequestedAt: null,
  deferralDecidedAt: null,
  deferralNote: null,
  previousJoiningDate: null,
  documentsDueAt: null,
  docReminderSentAt: null,
  docOverdueSentAt: null,
  offerFollowUpAt: null,
  offerFollowUpCount: 0,
};

/** Everything about an offer, cleared. Used when an offer is cancelled or withdrawn and the candidate goes back to Selected. */
export const CLEAR_OFFER = {
  offerPackage: null,
  offerMessage: null,
  offerType: "FULL_TIME" as const,
  offerCtcLpa: null,
  offerStipend: null,
  bondMonths: null,
  bondNote: null,
  joiningDate: null,
  ...FRESH_OFFER_STATE,
};

/**
 * A "Convert to full-time" offer sits on the same application as the internship. If that conversion
 * is cancelled or withdrawn, the candidate goes back to "internship accepted", not to Selected,
 * so the internship is never lost.
 */
export function backToInternship(stipend: number | null) {
  return {
    stage: "OFFER_ACCEPTED" as const,
    offerType: "INTERNSHIP" as const,
    offerPackage: formatPackage({ offerType: "INTERNSHIP", offerCtcLpa: null, offerStipend: stipend }) || null,
    offerMessage: null,
    offerCtcLpa: null,
    bondMonths: null,
    bondNote: null,
    joiningDate: null,
    offerSentAt: null,
    offerRequestedAt: null,
    offerRespondedAt: new Date(),
    joined: false,
    joinedByRole: null,
    ...FRESH_OFFER_STATE,
  };
}
