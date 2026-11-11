/**
 * Lock and registry strings can carry bidi controls and default-ignorable characters, which make a
 * version or a replacement read as something else (Trojan Source). The page shows each as a
 * `\u{…}` escape, the form lockrot's text formats print.
 */

const HIDDEN = /[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;

export const visibleControls = (text: string): string =>
  text.replace(HIDDEN, (ch) => `\\u{${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`);

/** A copy of parsed JSON with `visibleControls` applied to every string, object keys included. */
export function visibleData(value: unknown): unknown {
  if (typeof value === "string") return visibleControls(value);
  if (Array.isArray(value)) return value.map(visibleData);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [visibleControls(key), visibleData(item)]),
  );
}
