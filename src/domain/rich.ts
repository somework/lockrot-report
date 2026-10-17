/**
 * A phrase of the detail sheet with its markup: the page draws each piece, and `plain` gives the
 * text that the goldens hold (SPEC §7.9.14), which leaves the markup out.
 */

/** An in-page jump: the Security row or Release branches. */
export type JumpTarget = "security" | "branches";

export type Piece =
  | string
  | { readonly code: string }
  | { readonly strong: string }
  | { readonly href: string; readonly text: string; readonly name: string }
  /** `lead` is the jump's own separator: paper drops the two together. */
  | { readonly jump: JumpTarget; readonly text: string; readonly lead?: string };

export type Rich = readonly Piece[];

export function pieceText(piece: Piece): string {
  if (typeof piece === "string") return piece;
  if ("code" in piece) return piece.code;
  if ("strong" in piece) return piece.strong;
  if ("jump" in piece) return (piece.lead ?? "") + piece.text;
  return piece.text;
}

export const plain = (rich: Rich): string => rich.map(pieceText).join("");

/** An out-link's accessible name: "{name}, opens in a new tab". */
export const newTab = (name: string): string => `${name}, opens in a new tab`;
