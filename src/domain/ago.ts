import { decimal } from "./format";

/** The years phrase of lockrot's text grammar: a published 0 is "less than three weeks". */
export function ago(years: number): string {
  return years === 0 ? "less than three weeks ago" : `${decimal(years, 1)} years ago`;
}

/** `ago` of an upper bound (R9-42): "at most", except at 0, where "less than three weeks" already bounds it. */
export const agoAtMost = (years: number, atMost: boolean): string =>
  atMost && years !== 0 ? `at most ${ago(years)}` : ago(years);
