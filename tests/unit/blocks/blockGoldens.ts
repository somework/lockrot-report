// The detail sheet's blocks in the form of the model's goldens (SPEC §7.9.14): every fold open, no
// markup, no marks and no hidden text.
import { ageRows } from "../../../src/domain/ageRows";
import { branchesLead, branchTimeline, laneMarks, laneWords } from "../../../src/domain/branchTimeline";
import type { Holder, HeldByBlock } from "../../../src/domain/moveCards";
import { commandLabel, commandLines, holderName, moveCards, STEP_LABEL } from "../../../src/domain/moveCards";
import { gateLines, qualifiers, reachLines } from "../../../src/domain/qualifierRows";
import { plain } from "../../../src/domain/rich";
import { rungLines, securityBlock } from "../../../src/domain/securityBlock";
import { readingRich, verdictBlock, verdictLineText } from "../../../src/domain/verdictBlock";
import type { Finding, RepositoryMetadata, Run } from "../../../src/model/report";

export const BLOCK_KEYS = [
  "verdict_line",
  "readings",
  "qualifiers",
  "moves",
  "held_by",
  "security",
  "security_row",
  "branches_lead",
  "branch_rows",
  "age_rows",
] as const;

export type BlockKey = (typeof BLOCK_KEYS)[number];

const holder = (h: Holder) => ({
  name: holderName(h),
  grade: h.grade,
  meta: plain(h.meta),
  step: h.step === null ? null : `${STEP_LABEL} ${h.step}`,
});

const heldBy = (block: HeldByBlock | null) =>
  block === null
    ? null
    : {
        count: block.count,
        shown: block.shown.map(holder),
        fold:
          block.fold === null
            ? null
            : { summary: block.fold.summary, holders: block.fold.holders.map(holder) },
      };

/** One block's golden, written by the page's domain functions. */
export function blockGolden(
  key: BlockKey,
  finding: Finding,
  run: Run,
  metadata: RepositoryMetadata | null,
): unknown {
  switch (key) {
    case "verdict_line":
      return verdictLineText(verdictBlock(finding, run, metadata));
    case "readings":
      return verdictBlock(finding, run, metadata).readings.map((r) => ({
        flag: r.flag,
        text: plain(readingRich(r)),
      }));
    case "qualifiers": {
      const q = qualifiers(finding, run);
      return {
        reach: q.reach === null ? [] : reachLines(q.reach),
        origin: q.origin,
        not_judged: q.notJudged,
        unchecked: q.unchecked,
        not_run: q.notRun,
        php: q.php,
        php_edge: q.phpEdge,
        accepted:
          q.accepted === null
            ? []
            : [
                q.accepted.head,
                q.accepted.reason,
                ...(q.accepted.entry === null ? [] : [plain(q.accepted.entry)]),
              ],
        gate: gateLines(q.gate),
      };
    }
    case "moves":
      return moveCards(finding, run).map((c) => ({
        heading: c.heading,
        action: plain(c.action),
        platform_step: c.platformStep,
        commands: commandLines(c.argvs),
        commands_label: commandLabel(c.argvs),
        clears: c.clears,
        stays: c.stays,
        not_checked: c.notChecked,
        adds: c.adds,
        php:
          c.php === null
            ? null
            : { head: c.php.head === null ? null : plain(c.php.head), lines: c.php.lines },
        after:
          c.after === null ? null : { result: c.after.result, conditions: c.after.conditions.map(plain) },
        composer: c.composer.map((n) => ({ text: plain(n.text), items: n.items })),
      }));
    case "held_by":
      return moveCards(finding, run).map((c) => heldBy(c.heldBy));
    case "security": {
      const s = securityBlock(finding, run, metadata);
      return {
        summary: [s.head, ...s.lines],
        counts: s.counts.map((c) => `${c.severity} ${c.count}`),
        meanwhile: s.meanwhile === null ? null : plain(s.meanwhile),
        caption: s.caption,
        groups: s.groups.map(({ severity, count, words, open }) => ({ severity, count, words, open })),
        rows: s.rows.map((r) => ({
          name: r.name,
          source: r.source,
          deciding: r.deciding,
          severity: r.severity,
          fix: r.fix,
          affects: r.affects === null ? null : `affects ${r.affects.folded ?? r.affects.range}`,
          ranges: r.affects?.folded ? r.affects.parts : null,
          same_as: r.sameAs?.id ?? null,
        })),
        ignored: s.ignored,
        ladder: s.ladder.map((r) => ({ branch: r.branch, marks: r.marks, lines: rungLines(r) })),
      };
    }
    case "security_row": {
      const s = securityBlock(finding, run, metadata);
      const counts = s.counts.map((c) => `${c.severity} ${c.count}`).join(", ");
      return [
        counts === "" ? s.head : `${s.head} ${counts}`,
        ...s.lines,
        ...(s.meanwhile === null ? [] : [plain(s.meanwhile)]),
        ...s.ladder.flatMap(rungLines),
      ];
    }
    case "branches_lead":
      return branchesLead(finding, metadata);
    case "branch_rows":
      return (branchTimeline(finding, metadata, run)?.lanes ?? []).map((l) => ({
        branch: l.branch,
        marks: laneMarks(l),
        latest: l.version,
        age: l.age,
        php: l.php,
        php_words: l.phpWords,
        bar: laneWords(l),
        folded_in: l.foldedIn,
      }));
    case "age_rows":
      return ageRows(finding, metadata);
  }
}
