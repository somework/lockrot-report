import { decimal } from "./format";

/** The years phrase of lockrot's text grammar: a published 0 is "less than three weeks". */
export function ago(years: number): string {
  return years === 0 ? "less than three weeks ago" : `${decimal(years, 1)} years ago`;
}
