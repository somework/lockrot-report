/**
 * The libyears ledger and a package's own libyears row: how far behind a package's installed
 * release is from the newest stable one, in fractional years, and how to say so — or say why it
 * could not be measured at all.
 *
 * `libyearsSortKey`, `libyearsReason`, `libyearsAtZero` and `libyearsItems` are ported from legacy
 * `lib.js` (lib.md §§8,11,10,12), adapted from the wire document's snake_case shapes to `Model`'s:
 * `LibyearsBlock.unmeasured` arrives here as a zero-filled `[reason, count]` list (every reason
 * lockrot knows, DESIGN.md's `Model` contract) rather than a sparse `{reason: count}` object, so the
 * sum below is a reduce over its counts instead of `Object.keys`.
 *
 * `libyearsSummary` is not ported: it is dead code even in the legacy page (critic.md D2 — the page
 * never calls it; only a PHPUnit string assertion on the source kept it in the file, critic.md R1,
 * which does not apply to a TypeScript rewrite). `libyearsItems` is what a caller here joins itself.
 *
 * `libyearsRowPhrases` is new: the detail panel's libyears row (`report.js:1057-1082`) always
 * renders — critic.md C6 corrects lib.md/js-3.md's claim that it can be omitted when empty — so this
 * function returns the row's secondary phrases as data (`{text, date?}[]`) instead of pre-built,
 * pre-escaped HTML, per critic.md M4.
 */

import type { ExplainMetadata, Finding, LibyearsBlock } from "../model/types";
import { fixed } from "./format";

/**
 * Sort key for the packages table's libyears column: the value itself, with an unmeasured package
 * (no libyears, or a document from before the field) sorting below every measured one — including a
 * measured package whose libyears is exactly `0`, since `0` is a valid, distinct value and `-1` is
 * not. Ported from legacy `libyearsSortKey()` (`lib.js:92-95`).
 */
export function libyearsSortKey(finding: Pick<Finding, "libyears"> | null): number {
  const value = finding ? finding.libyears : null;

  return value === null ? -1 : value;
}

/**
 * Why a finding carries no libyears value, in the words the report's `unmeasured` block counts it
 * under — read off the finding the way the block itself does. Ported from legacy `libyearsReason()`
 * (`lib.js:130-140`). Empty string for a measured finding, `libyears === 0` included.
 */
export function libyearsReason(finding: Pick<Finding, "libyears" | "version" | "note"> | null): string {
  if (!finding || fixed(finding.libyears, 1) !== null) return "";
  // Model types finding.libyears as `number | null`, so this branch is unreachable from any document
  // normalize.ts produces — kept for parity with the legacy contract and as a defence against a
  // NaN/Infinity libyears value reaching here by some other path (fixed() rejects both).
  if (finding.libyears !== null) return "not a number in this document";
  if (finding.note === "not from a Composer repository, not checked") return "not from a Composer repository";
  if (finding.note) return "metadata unavailable";

  // A linear cut, not a backtracking regex: `/#.*$/` retries from every "#" a hostile version
  // string carries ahead of a trailing newline (no `m`/`s` flag stops `.`/`$` at it), which is
  // quadratic in the number of "#" characters — a crafted document could freeze this render.
  const hashIndex = finding.version.indexOf("#");
  const version = hashIndex < 0 ? finding.version : finding.version.slice(0, hashIndex);

  return /^dev-/.test(version) || /-dev$/.test(version)
    ? "branch snapshot"
    : "no release date lockrot trusts";
}

/**
 * What a libyears value of exactly zero says about the installed release: it is the newest stable,
 * or it is a release that is not behind it — never "ahead": the value is a difference of release
 * dates clamped at zero, so a pre-release above the newest, a tag released the same day, and a
 * backport on an older branch released after the newest all read zero, and the document carries no
 * version order to tell them apart. Ported from legacy `libyearsAtZero()` (`lib.js:116-121`). `null`
 * for anything but an exact zero, read off the value itself, never off its rounded form.
 */
export function libyearsAtZero(
  finding: Pick<Finding, "libyears" | "version"> | null,
  meta: Pick<ExplainMetadata, "lastStableVersion"> | null,
): string | null {
  if (!finding || finding.libyears !== 0) return null;
  const newest = meta?.lastStableVersion ?? null;

  return newest && newest !== finding.version
    ? `not behind the newest stable, ${newest}`
    : "the installed release is the newest";
}

/**
 * The libyears block, minus the total, as the ledger's items after the number: `"across 191 of 200
 * packages"`, `"94.5 from direct requirements"`, `"furthest behind smalot/pdfparser v1.1.0 at
 * 4.7"`. `"none of the N packages could be measured"` when nothing was, `"nothing to measure"` on an
 * empty run, and `[]` for a document with no libyears block at all. Ported from legacy
 * `libyearsItems()` (`lib.js:151-174`); each string is plain text, and the caller escapes it or uses
 * `textContent`/JSX, since a package name comes from the document.
 */
export function libyearsItems(block: LibyearsBlock | null): string[] {
  if (!block) return [];
  const unmeasured = block.unmeasured.reduce((sum, [, count]) => sum + count, 0);
  const packages = block.measured + unmeasured;

  if (!block.measured) {
    if (!packages) return ["nothing to measure"];

    return [
      packages === 1
        ? "the one package could not be measured"
        : `none of the ${packages} packages could be measured`,
    ];
  }

  const scope =
    block.measured === packages
      ? packages === 1
        ? "the one package"
        : `all ${packages} packages`
      : `${block.measured} of ${packages} packages`;
  const items = [`across ${scope}`];
  const worst = block.furthestBehind;
  if (worst) {
    const direct = fixed(block.directRequirements, 1);
    if (direct !== null) items.push(`${direct} from direct requirements`);
    const behind = fixed(worst.libyears, 1);
    items.push(`furthest behind ${worst.package} ${worst.version}${behind === null ? "" : ` at ${behind}`}`);
  }

  return items;
}

/** One phrase of a package's libyears row, as data rather than markup (critic.md M4). */
export interface LibyearsPhrase {
  /** Plain text; the caller escapes it (or lets JSX do so) — this module never produces markup. */
  text: string;
  /**
   * An ISO date the phrase names, when it names one. The caller formats it with `format.day()` and
   * keeps it from wrapping mid-word, the way the legacy row's nowrap span did (`report.js:1064`).
   */
  date?: string;
}

/**
 * The secondary phrases that follow the formatted libyears value in a package's detail-panel row —
 * what the release is measured against, or, at zero, whether it is the newest or merely not behind
 * it. Ported from legacy `libyearsRow()`'s phrase-building (`report.js:1057-1082`), minus its HTML:
 * critic.md M4 gives the exact precedence this preserves, and critic.md C6 is why this section is
 * still worth calling even when its answer is "nothing to add" — the row itself always renders.
 *
 * Returns `[]` for an unmeasured finding: the caller shows `libyearsReason(finding)` instead, next
 * to `fixed(finding.libyears, 1)` (`null` there too) for the row's headline value.
 */
export function libyearsRowPhrases(
  finding: Pick<Finding, "libyears" | "version"> | null,
  metadata: Pick<
    ExplainMetadata,
    | "hasStableRelease"
    | "lastStableRelease"
    | "lastStableVersion"
    | "installedRelease"
    | "installedReleaseDatedBy"
  > | null,
): LibyearsPhrase[] {
  if (!finding || fixed(finding.libyears, 1) === null) return [];

  const newest = metadata?.lastStableVersion ?? null;
  const atZero = libyearsAtZero(finding, metadata);

  let why: LibyearsPhrase | null = null;
  if (metadata?.hasStableRelease && !metadata.lastStableRelease) {
    // The newest release itself carries no date; measured instead to the newest dated one above it.
    why = { text: "at least: the newest release is undated, measured to the newest dated one above" };
  } else if (atZero !== null) {
    why = { text: atZero };
  } else if (newest) {
    why = metadata?.lastStableRelease
      ? { text: `newest ${newest} released `, date: metadata.lastStableRelease }
      : { text: `newest ${newest}` };
  }

  const phrases: LibyearsPhrase[] = why ? [why] : [];
  if (metadata?.installedReleaseDatedBy) {
    // A split package: the lock dates the installed version by a commit its tags share, the
    // monorepo's tag by its own release.
    const name = metadata.installedReleaseDatedBy;
    phrases.push(
      metadata.installedRelease
        ? { text: `installed release dated by ${name}, `, date: metadata.installedRelease }
        : { text: `installed release dated by ${name}` },
    );
  }

  return phrases;
}
