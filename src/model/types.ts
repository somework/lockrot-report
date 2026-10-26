/**
 * The page's own types around the report-2 document: the model `normalize()` hands the rest of the
 * code, the views, the signal ids the page has words for, and why a payload cannot be rendered.
 */

import type { Report2Embed } from "./report";

export const SIGNAL_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11"] as const;
export type KnownSignalId = (typeof SIGNAL_IDS)[number];
export type SignalId = KnownSignalId | (string & {});

export const VIEWS = ["overview", "findings", "advisories", "packages", "radius", "run"] as const;
export type View = (typeof VIEWS)[number];

/** The report-2 embed `normalize()` accepted, with the schema it states. */
export interface Model extends Report2Embed {
  /** `report.lockrot.schema`: 2 or newer. */
  schema: number;
  /** True when `schema` is newer than this renderer reads; the page says so. */
  newerSchema: boolean;
}

/** Why a payload cannot be rendered at all. `message` is shown to the reader as is. */
export type NormalizeError =
  | { kind: "not-json" | "not-a-report" | "malformed-report" | "render-failed"; message: string }
  /** A report-1 document: `version` is its `lockrot.version`, for the report-1 screen. */
  | { kind: "report-1"; message: string; version: string | null };
