import { decimal } from "./format";

/** The years phrase of lockrot's text grammar: a published 0 is "less than three weeks". */
export function ago(years: number): string {
  return years === 0 ? "less than three weeks ago" : `${decimal(years, 1)} years ago`;
}

/** `ago` of an age that is an upper bound (R9-42, G145); a published 0 carries no bound. */
export const agoAtMost = (years: number, atMost: boolean): string =>
  atMost && years !== 0 ? `at most ${ago(years)}` : ago(years);
