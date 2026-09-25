/**
 * How a package you do not require yourself gets in: every requirement of yours that reaches it,
 * read from the finding's own fields. The answer sentence (`domain/answer.ts`), the priority ladder's
 * reach rung (`domain/priority.ts`) and the "How it gets in" chain (`detail/DetailLead.tsx`) all
 * name the ways in from this one list, so they never disagree on how many there are — an evaluator
 * found the ladder saying "only reached through" one package while the sentence above it named two.
 */

import type { Finding } from "../model/types";

/**
 * The requirements a transitive finding comes in through: its chain's first hop first (the path
 * the chain draws), then every other entry of `directDependents` in document order, each once. The
 * package itself is never one of them (a direct finding's `directDependents` lists itself). Empty
 * for a direct finding and for one the document says nothing reaches.
 */
export function waysIn(finding: Finding): readonly string[] {
  if (finding.direct) return [];
  const first = finding.chain.length > 1 ? finding.chain[0] : undefined;
  const ways = first === undefined ? [] : [first];
  for (const pkg of finding.directDependents) {
    if (pkg !== finding.package && !ways.includes(pkg)) ways.push(pkg);
  }
  return ways;
}

/** Past this many ways in, a sentence counts them ("3 of your requirements") rather than naming
 *  each one; the chain below still names the first. */
export const WAYS_NAMED = 2;
