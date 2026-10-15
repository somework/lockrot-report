/**
 * unknown → Model, in one place, never throwing: the `{report, details}` bundle or a bare
 * `--format=json` document (DESIGN.md §2). A report-1 document stops here with the `report-1`
 * error, and the page reads report-2 only.
 */

import type { Model, NormalizeError } from "./types";
import { REPORT2_KEYS, type Details, type Report2 } from "./report";
import { READS_SCHEMAS } from "../schema";

export type NormalizeResult = { ok: true; model: Model } | { ok: false; error: NormalizeError };

const NOT_A_REPORT_MESSAGE =
  "This does not look like a lockrot report. Expected either the html bundle " +
  "({report, details}) or a --format=json document (with 'lockrot' and 'findings').";

const NO_GENERATED_AT_MESSAGE =
  "This report has no readable 'generated_at' date, so ages and the timeline cannot be shown.";

const REPORT1_MESSAGE = "This is a report-1 document, and this page reads report-2 only.";

export function normalize(input: unknown): NormalizeResult {
  if (!isRecord(input)) return failure("not-a-report", NOT_A_REPORT_MESSAGE);

  const shape = pickReportShape(input);
  if (shape === null) return failure("not-a-report", NOT_A_REPORT_MESSAGE);

  const lockrot = isRecord(shape.reportSource.lockrot) ? shape.reportSource.lockrot : {};
  const schema = typeof lockrot.schema === "number" && Number.isFinite(lockrot.schema) ? lockrot.schema : 1;
  if (schema < 2) {
    const version = typeof lockrot.version === "string" ? lockrot.version : null;
    return { ok: false, error: { kind: "report-1", message: REPORT1_MESSAGE, version } };
  }

  const missing = REPORT2_KEYS.filter((key) => !(key in shape.reportSource));
  if (missing.length > 0) {
    return failure(
      "malformed-report",
      `This report-2 document leaves out keys lockrot always writes: ${missing.join(", ")}.`,
    );
  }

  const generatedAt = shape.reportSource.generated_at;
  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
    return failure("not-a-report", NO_GENERATED_AT_MESSAGE);
  }

  // Typed as lockrot's contract: every root key report-2 requires is present.
  return {
    ok: true,
    model: {
      report: shape.reportSource as Report2,
      details: (isRecord(shape.detailsSource) ? shape.detailsSource : {}) as Details,
      schema,
      newerSchema: schema > Math.max(...READS_SCHEMAS),
    },
  };
}

export function parseBundle(text: string): NormalizeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure("not-json", "This file is not valid JSON.");
  }
  return normalize(parsed);
}

function failure(kind: Exclude<NormalizeError["kind"], "report-1">, message: string): NormalizeResult {
  return { ok: false, error: { kind, message } };
}

interface ReportShape {
  reportSource: Record<string, unknown>;
  detailsSource: unknown;
}

/** A bare `--format=json` document has no `report` key but carries `lockrot` and `findings`. */
function pickReportShape(input: Record<string, unknown>): ReportShape | null {
  if ("report" in input) {
    return isRecord(input.report) ? { reportSource: input.report, detailsSource: input.details } : null;
  }
  if (isRecord(input.lockrot) && "findings" in input) {
    return { reportSource: input, detailsSource: undefined };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
