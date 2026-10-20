// The report-2 types against lockrot's published schemas, at runtime: every recorded document
// validates, each type guard sends every value to the schema definition of the branch it narrows
// to, and the hand-typed `details` keys equal explain-2's `required` lists (types are erased, so
// only the data can tell).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv from "ajv-draft-04";
import { describe, expect, test } from "vitest";

import type { Report2 } from "../../../contract/lockrot-report-2";
import {
  REPORT2_KEYS,
  isScoreGraded,
  isSecurityVulnerable,
  isSignal,
  isTermSecurity,
  type DetailsEntry,
  type DetailsLock,
  type ReleaseBranch,
  type RepositoryMetadata,
} from "../../../src/model/report";
import { embeds, readJson, reportDocuments } from "./lockrotContract";

const REPORT_ID = "https://lockrot.dev/schema/report-2.json";
const EXPLAIN_ID = "https://lockrot.dev/schema/explain-2.json";

// lockrot's tools/schema/node/ajv_all.js checks `date-time` with this RFC 3339 pattern.
/** The list of every key of T: a key left out makes the call ask for an argument naming it. */
function keysOf<T>() {
  return <const L extends readonly (keyof T & string)[]>(
    list: L,
    ..._missing: [Exclude<keyof T, L[number]>] extends [never] ? [] : [missing: Exclude<keyof T, L[number]>]
  ): string[] => [...list].sort();
}

const LOCK_KEYS = [
  "php",
  "released",
  "repository",
  "from_composer_repository",
  "dev",
  "branch_snapshot",
  "type",
] as const;
const METADATA_KEYS = [
  "abandoned",
  "replacement",
  "releases_listed",
  "has_stable_release",
  "last_stable_release",
  "last_stable_version",
  "last_stable_dated_by",
  "installed_release",
  "installed_release_dated_by",
  "repository",
  "type",
  "data_date",
  "branches",
  "installed_branch",
] as const;
const BRANCH_KEYS = [
  "branch",
  "installed",
  "highest",
  "highest_released",
  "highest_commit_date",
  "newest_dated",
  "newest_dated_released",
  "dated_by",
  "php",
  "highest_php",
  "admits_target_php",
  "admits_project_php",
  "highest_admits_target_php",
  "highest_admits_project_php",
  "php_blocked_by",
  "misses_target_php",
  "misses_project_php",
  "highest_misses_project_php",
  "released_years",
  "fixes",
] as const;

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const reportSchema = readJson(join(process.cwd(), "contract", "lockrot-report-2.schema.json")) as {
  required: string[];
};
const explainSchema = readJson(join(process.cwd(), "contract", "lockrot-explain-2.schema.json")) as {
  definitions: Record<
    string,
    { required: string[]; properties: Record<string, { items?: { required: string[] } }> }
  >;
};

const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addFormat("date-time", DATE_TIME);
ajv.addSchema(reportSchema);
ajv.addSchema(explainSchema);

const validateReport = ajv.compile({ $ref: REPORT_ID });
const validateLock = ajv.compile({ $ref: `${EXPLAIN_ID}#/definitions/lock` });
const validateMetadata = ajv.compile({
  oneOf: [{ $ref: `${EXPLAIN_ID}#/definitions/repositoryMetadata` }, { type: "null" }],
});

function definitionOf(name: string): (value: unknown) => boolean {
  const validate = ajv.compile({ $ref: `${REPORT_ID}#/definitions/${name}` });
  return (value) => validate(value);
}

const DEFINITION = {
  scoreGraded: definitionOf("scoreGraded"),
  scoreZero: definitionOf("scoreZero"),
  termSecurity: definitionOf("termSecurity"),
  termMaintenance: definitionOf("termMaintenance"),
  securityVulnerable: definitionOf("securityVulnerable"),
  securityOther: (value: unknown) =>
    definitionOf("securityClear")(value) || definitionOf("securityUnchecked")(value),
};

const SIGNAL_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"] as const;
const SIGNAL_DATA = Object.fromEntries(SIGNAL_IDS.map((id) => [id, definitionOf(id.toLowerCase())]));

function errorsOf(validate: { errors?: unknown }): unknown {
  return validate.errors;
}

const documents = reportDocuments();
const recordedEmbeds = embeds();
const reports: { name: string; report: Report2 }[] = [
  ...documents.map(({ name, document }) => ({ name, report: document as Report2 })),
  ...recordedEmbeds.map(({ name, embed }) => ({ name, report: (embed as { report: Report2 }).report })),
];

describe("every recorded report-2 document validates against the report-2 schema", () => {
  test("the fetched bundle holds report-2 documents and html embeds", () => {
    expect(documents.length).toBeGreaterThan(0);
    expect(recordedEmbeds.length).toBeGreaterThan(0);
  });

  test.each(reports)("$name", ({ report }) => {
    expect(validateReport(report), JSON.stringify(errorsOf(validateReport))).toBe(true);
  });
});

describe("each html embed's details validate against explain-2's lock and repositoryMetadata", () => {
  test.each(recordedEmbeds)("$name", ({ embed }) => {
    const details = (embed as { details: Record<string, Record<string, unknown>> }).details;
    const wrong = Object.entries(details).flatMap(([pkg, entry]) => [
      ...(Object.keys(entry).sort().join() === "lock,metadata,repository_link" ? [] : [`${pkg}: keys`]),
      ...(validateLock(entry.lock) ? [] : [`${pkg}.lock: ${JSON.stringify(errorsOf(validateLock))}`]),
      ...(validateMetadata(entry.metadata)
        ? []
        : [`${pkg}.metadata: ${JSON.stringify(errorsOf(validateMetadata))}`]),
      ...(entry.repository_link === null || typeof entry.repository_link === "string"
        ? []
        : [`${pkg}.repository_link: ${typeof entry.repository_link}`]),
    ]);

    expect(Object.keys(details).length).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });
});

/** Every guard decision over every recorded value, with the definition the narrowed branch must satisfy. */
function guardDecisions(): { guard: string; branch: boolean; valid: boolean; where: string }[] {
  return reports.flatMap(({ name, report }) =>
    report.findings.flatMap((finding) => {
      const where = `${name} ${finding.package}`;
      const graded = isScoreGraded(finding.score);
      const vulnerable = isSecurityVulnerable(finding.security);
      return [
        {
          guard: "isScoreGraded",
          branch: graded,
          valid: graded ? DEFINITION.scoreGraded(finding.score) : DEFINITION.scoreZero(finding.score),
          where,
        },
        ...(isScoreGraded(finding.score) ? finding.score.terms : []).map((term) => {
          const security = isTermSecurity(term);
          return {
            guard: "isTermSecurity",
            branch: security,
            valid: security ? DEFINITION.termSecurity(term) : DEFINITION.termMaintenance(term),
            where,
          };
        }),
        {
          guard: "isSecurityVulnerable",
          branch: vulnerable,
          valid: vulnerable
            ? DEFINITION.securityVulnerable(finding.security)
            : DEFINITION.securityOther(finding.security),
          where,
        },
        ...finding.signals.map((signal) => {
          const matched = SIGNAL_IDS.filter((id) => isSignal(signal, id));
          return {
            guard: `isSignal ${signal.id}`,
            branch: matched.length === 1,
            valid: matched.length === 1 && SIGNAL_DATA[matched[0] ?? ""]?.(signal.data) === true,
            where,
          };
        }),
      ];
    }),
  );
}

const SHEETS = join(process.cwd(), "fixtures", "sheets");
const recordedSheets = readdirSync(SHEETS)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({
    name: file,
    sheet: JSON.parse(readFileSync(join(SHEETS, file), "utf8")) as {
      finding: unknown;
      details: { lock: unknown; metadata: unknown };
    },
  }));
const validateFinding = ajv.compile({ $ref: `${REPORT_ID}#/definitions/finding` });

describe("each recorded sheet under fixtures/sheets validates against the pinned schemas", () => {
  test("the folder holds a sheet", () => {
    expect(recordedSheets.length).toBeGreaterThan(0);
  });

  test.each(recordedSheets)("$name", ({ sheet }) => {
    expect(validateFinding(sheet.finding), JSON.stringify(errorsOf(validateFinding))).toBe(true);
    expect(validateMetadata(sheet.details.metadata), JSON.stringify(errorsOf(validateMetadata))).toBe(true);
  });
});

describe("the type guards", () => {
  const decisions = guardDecisions();

  test("narrow every recorded value to a branch whose schema definition it satisfies", () => {
    expect(decisions.filter((decision) => !decision.valid)).toEqual([]);
  });

  test.each(["isScoreGraded", "isTermSecurity", "isSecurityVulnerable"])(
    "%s takes both branches on the recorded documents",
    (guard) => {
      const branches = new Set(decisions.filter((d) => d.guard === guard).map((d) => d.branch));
      expect([...branches].sort()).toEqual([false, true]);
    },
  );

  test("isSignal meets every signal id on the recorded documents", () => {
    const seen = new Set(decisions.filter((d) => d.guard.startsWith("isSignal")).map((d) => d.guard));
    expect([...seen].sort()).toEqual(SIGNAL_IDS.map((id) => `isSignal ${id}`).sort());
  });
});

describe("the keys typed by hand equal the schemas' required lists", () => {
  const { lock, repositoryMetadata } = explainSchema.definitions;

  test("REPORT2_KEYS, the boundary check of normalize, is report-2's root required list", () => {
    expect([...REPORT2_KEYS].sort()).toEqual([...reportSchema.required].sort());
  });

  test.each([
    ["lock", lock?.required, keysOf<DetailsLock>()(LOCK_KEYS)],
    ["repositoryMetadata", repositoryMetadata?.required, keysOf<RepositoryMetadata>()(METADATA_KEYS)],
    [
      "repositoryMetadata.branches[]",
      repositoryMetadata?.properties.branches?.items?.required,
      keysOf<ReleaseBranch>()(BRANCH_KEYS),
    ],
  ])("%s", (_name, required, typed) => {
    expect(typed).toEqual([...(required ?? [])].sort());
  });

  test("a details entry holds lock, metadata and repository_link", () => {
    expect(keysOf<DetailsEntry>()(["lock", "metadata", "repository_link"])).toEqual([
      "lock",
      "metadata",
      "repository_link",
    ]);
  });
});
