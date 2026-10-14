/**
 * The baseline suffix (§6.4 of lockrot's spec): `(baseline: 13 advisories known; 1 new advisory)`,
 * from `finding.baseline` and the per-fact states alone, never from the baseline file.
 */

import type { Finding, FindingBaseline, Run } from "../model/report2";
import { isScoreGraded } from "../model/report2";
import { advisoryRows } from "./advisoryRows";

type Worsened = NonNullable<FindingBaseline>["worsened_by"][number];

const advisories = (count: number): string => (count === 1 ? "advisory" : "advisories");

/** An advisory the way a sentence names it: its CVE, else its id. */
function advisoryName(finding: Finding, id: string): string {
  return advisoryRows(finding).find((row) => row.id === id)?.cve ?? id;
}

function advisoryItem(finding: Finding, run: Run, entry: Worsened, comparedFixes: boolean): string | null {
  if (entry.kind !== "advisory" || entry.why === "new" || entry.now === null || entry.recorded === null)
    return null;
  const name = advisoryName(finding, entry.id);
  const lost = ` fix lost: ${entry.recorded.fix_kind} → ${entry.now.fix_kind}`;
  if (entry.why === "fix_lost") return `${name}${lost}`;
  // A fix is lost once it needs no reachable fix to be doubled: the kinds the model doubles.
  const doubles = (kind: string): boolean =>
    run.score_model.fix_kinds.some(({ id, doubles: lostKind }) => id === kind && lostKind);
  const crossed = comparedFixes && !doubles(entry.recorded.fix_kind) && doubles(entry.now.fix_kind);
  return `${name} re-rated ${entry.recorded.severity} → ${entry.now.severity}${crossed ? `,${lost}` : ""}`;
}

/** `null` without a baseline, and for a finding with no grade. */
export function baselineSuffix(finding: Finding, run: Run): string | null {
  const { baseline } = finding;
  if (baseline === null || !isScoreGraded(finding.score)) return null;
  if (baseline.recorded === null) return "(baseline: new package)";

  const { advisories_now: now, worsened_by: worsened, recorded } = baseline;
  const comparedFixes = recorded.target_php === run.target_php && recorded.fix_model === run.fix_model;
  const items = [
    now.known > 0 ? `${now.known} ${advisories(now.known)} known` : null,
    ...worsened.filter(({ kind }) => kind === "flag").map(({ id }) => `${id} new`),
    now.new > 0 ? `${now.new} new ${advisories(now.new)}` : null,
    ...worsened.map((entry) => advisoryItem(finding, run, entry, comparedFixes)),
    ...finding.flags
      .filter(({ baseline: fact }) => fact?.state === "covered")
      .map(({ id, baseline: fact }) => `${id} covered by the recorded ${fact?.covered_by ?? ""}`),
  ].filter((item) => item !== null);

  return `(baseline: ${items.length === 0 ? "known" : items.join("; ")})`;
}
