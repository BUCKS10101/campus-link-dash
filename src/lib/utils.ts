import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Plain twMerge doesn't know about this project's custom font-size scale
 * (text-display, text-h2, text-body, ...) - it only recognises Tailwind's
 * default text-xs..text-9xl suffixes as font-size. Every other "text-*"
 * suffix falls into its text-COLOR group instead, so e.g. "text-body
 * text-primary-foreground" was silently resolving to just "text-body":
 * twMerge treated both as the same conflicting group and dropped the
 * color. That's not a hypothetical - it was actively deleting button
 * text color across the app (see tailwind.config.ts's fontSize scale
 * for the full list of keys this teaches twMerge about).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display",
        "text-display-sm",
        "text-h1",
        "text-h2",
        "text-h3",
        "text-body",
        "text-body-sm",
        "text-caption",
        "text-label",
        "text-data",
        "text-data-lg",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * supabase-js rejects with plain `{ message, code, ... }` objects (not
 * Error instances) for PostgREST/Postgres errors, so a bare
 * `err instanceof Error` check silently swallows their message.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

/**
 * profiles.name is stored as the full name entered at signup (e.g. "Govind
 * Nair") - this extracts just the first token for greeting-style UI
 * ("Hello, Govind", "Govind's profile") without a second name field.
 */
export function getFirstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "";
}
