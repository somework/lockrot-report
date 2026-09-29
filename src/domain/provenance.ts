/** Where a package's facts came from (PD-RUN-5), or why the file carries none, from what a field
 *  says. */

import type { ExplainActivity, ExplainMetadata, Finding, Model } from "../model/types";
import { checkStrip } from "./checks";
import { fromComposerRepository } from "./links";
import { vocabTable } from "./vocab";

/** The reason a package's facts are absent because the file holds none for it. */
export const NO_FACTS_IN_FILE = "not in this document — it explains no package";
export const NO_FACTS_FOR_PACKAGE = "not in this document for this package";
export const NOT_FROM_COMPOSER = "none — not from a Composer repository";

export type MetadataSource =
  | { readonly kind: "read"; readonly metadata: ExplainMetadata; readonly asOf: string | null }
  | { readonly kind: "missing"; readonly asOf: string | null; readonly reason: string };

/** Repository activity as lockrot read it, as a fired S3/S4 check carries it, or why there is none. */
export type ActivitySource =
  | { readonly kind: "read"; readonly activity: ExplainActivity }
  | {
      readonly kind: "signal";
      /** The fired checks the facts are read from, in id order ("S4", "S3 · S4"). */
      readonly from: readonly string[];
      readonly host: string | null;
      readonly repository: string | null;
      readonly lastPush: string | null;
      /** `true` when S3 fired, `false` when S3 ran and stayed quiet, `null` when neither is known. */
      readonly archived: boolean | null;
    }
  | { readonly kind: "missing"; readonly reason: string };

export interface Provenance {
  readonly metadata: MetadataSource;
  readonly activity: ActivitySource;
}

function text(data: Readonly<Record<string, unknown>> | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** Why a detail block is empty when the package's details entry itself is missing. */
function noFactsReason(model: Model): string {
  return model.details.size === 0 ? NO_FACTS_IN_FILE : NO_FACTS_FOR_PACKAGE;
}

function metadataSource(model: Model, finding: Finding): MetadataSource {
  const details = model.details.get(finding.package);
  const metadata = details?.metadata ?? null;
  if (metadata !== null) return { kind: "read", metadata, asOf: metadata.dataDate ?? finding.dataDate };
  const reason =
    fromComposerRepository(finding, model.details) === false
      ? NOT_FROM_COMPOSER
      : details === undefined
        ? noFactsReason(model)
        : "none recorded for this package";
  return { kind: "missing", asOf: finding.dataDate, reason };
}

/** S3's and S4's own data, when either fired and names the repository. */
function fromSignals(finding: Finding): ActivitySource | null {
  const strip = checkStrip(finding);
  const s3 = strip.cells.find((cell) => cell.id === "S3");
  const s4 = strip.cells.find((cell) => cell.id === "S4");
  const fired = [s3, s4].flatMap((cell) => (cell?.state === "fired" && cell.signal ? [cell] : []));
  const named = fired.filter(
    (cell) => text(cell.signal?.data, "repo") !== null || text(cell.signal?.data, "host") !== null,
  );
  if (named.length === 0) return null;
  const pick = (key: string): string | null =>
    named.reduce<string | null>((found, cell) => found ?? text(cell.signal?.data, key), null);
  return {
    kind: "signal",
    from: named.map((cell) => cell.id),
    host: pick("host"),
    repository: pick("repo"),
    lastPush: s4?.state === "fired" ? text(s4.signal?.data, "last_push") : null,
    archived: s3?.state === "fired" ? true : s3?.state === "quiet" ? false : null,
  };
}

function activitySource(model: Model, finding: Finding): ActivitySource {
  const details = model.details.get(finding.package);
  if (details?.activity) return { kind: "read", activity: details.activity };
  const signal = fromSignals(finding);
  if (signal !== null) return signal;
  if (fromComposerRepository(finding, model.details) === false) {
    return { kind: "missing", reason: NOT_FROM_COMPOSER };
  }
  if (details === undefined) return { kind: "missing", reason: noFactsReason(model) };
  const blocked = checkStrip(finding)
    .cells.filter((cell) => (cell.id === "S3" || cell.id === "S4") && cell.state === "blocked")
    .map((cell) => cell.id);
  if (blocked.length > 0) {
    return {
      kind: "missing",
      reason: `none — S10 says ${blocked.join(" and ")} could not run`,
    };
  }
  return { kind: "missing", reason: "none recorded for this package" };
}

/** A package's provenance: each source read, or the reason this file gives none. */
export function provenance(model: Model, finding: Finding): Provenance {
  return { metadata: metadataSource(model, finding), activity: activitySource(model, finding) };
}

/** The repository-activity checks, whose evidence is the Provenance activity line. */
export const ACTIVITY_CHECKS: readonly string[] = ["S3", "S4"];

/** Each absent-activity reason, as the clause that follows "with no repository activity in this
 *  file" on the check strip. */
const UNREAD_BECAUSE: Readonly<Record<string, string>> = {
  [NOT_FROM_COMPOSER]: "the package is not from a Composer repository",
  [NO_FACTS_IN_FILE]: "the file explains no package",
  [NO_FACTS_FOR_PACKAGE]: "the file does not explain this package",
};

export interface QuietUnread {
  /** The quiet activity checks ("S3", "S4"), in id order. */
  readonly ids: readonly string[];
  /** Why the file holds no activity for them, as a clause. */
  readonly because: string;
}

/** Quiet S3/S4 cells of a package with no repository activity on file, marked apart so "quiet"
 *  never reads as "looked at and found fine". */
export function quietUnread(model: Model, finding: Finding): QuietUnread | null {
  const activity = activitySource(model, finding);
  if (activity.kind !== "missing") return null;
  const ids = checkStrip(finding)
    .cells.filter((cell) => ACTIVITY_CHECKS.includes(cell.id) && cell.state === "quiet")
    .map((cell) => cell.id);
  if (ids.length === 0) return null;
  return { ids, because: UNREAD_BECAUSE[activity.reason] ?? "none is recorded for this package" };
}

const ORIGIN_KIND_WORDS: Readonly<Record<string, string>> = vocabTable({
  packagist: "a Composer repository",
  composer: "a Composer repository",
  path: "a path repository of the project",
  vcs: "a VCS repository the manifest lists",
  artifact: "an archive in an artifact repository",
  package: "an inline package definition in the manifest",
  unknown: "a repository lockrot could not identify",
});

export type OriginFrom = { readonly words: string } | { readonly code: string };

/** `origin.kind` in words; a kind this page does not know as written. */
export function originFrom(kind: string | null): OriginFrom | null {
  if (kind === null || kind === "") return null;
  const words = ORIGIN_KIND_WORDS[kind];
  return words === undefined ? { code: kind } : { words };
}
