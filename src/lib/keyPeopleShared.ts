/**
 * Parts of the Key People feature that are safe to use in the browser too (no database code in this file).
 */

import { safeHref } from "./safeUrl";

export const MAX_KEY_PEOPLE = 3;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_ROLE_LENGTH = 60;
export const MAX_NAME_LENGTH = 80;

/** What a page needs to show one key person. Never includes the photo bytes. */
export interface KeyPersonView {
  id: string;
  position: number;
  role: string;
  name: string;
  profileUrl: string | null; // already checked: a safe http(s) link or null
  hasPhoto: boolean;
  photoVersion: number; // changes when the photo changes, so browsers fetch the new one
}

/** We look at the first bytes of the file, never at its name or the type the browser claims. SVG is refused on purpose. */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length > 12 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Trim, drop control characters and collapse spaces. React escapes the text when it is shown. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The fields to select (never the photo bytes) whenever key people are loaded, alone or inside another query. */
export const keyPersonSelect = {
  id: true,
  position: true,
  role: true,
  name: true,
  profileUrl: true,
  photo: { select: { uploadedAt: true } },
} as const;

export function toKeyPersonView(r: {
  id: string;
  position: number;
  role: string;
  name: string;
  profileUrl: string | null;
  photo: { uploadedAt: Date } | null;
}): KeyPersonView {
  return {
    id: r.id,
    position: r.position,
    role: r.role,
    name: r.name,
    profileUrl: safeHref(r.profileUrl),
    hasPhoto: r.photo !== null,
    photoVersion: r.photo ? r.photo.uploadedAt.getTime() : 0,
  };
}

