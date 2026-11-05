// One link rule (R12-22): the advisory's own `link` belongs to its source id, so only that id links
// and a different CVE id is text, on the detail sheet's Security list and on the verdict line.
import { describe, expect, test } from "vitest";

import { advisoryRows } from "../../../src/domain/advisoryRows";
import { advisorySourceIds } from "../../../src/domain/advisories";
import { newTab, plain } from "../../../src/domain/rich";
import { securityBlock } from "../../../src/domain/securityBlock";
import { readingRich, verdictBlock } from "../../../src/domain/verdictBlock";
import type { Finding, RepositoryMetadata, Run, S9row } from "../../../src/model/report";
import { modelCases } from "../words/recorded";

const LINK = "https://github.com/advisories/GHSA-v5mv-p594-2x33";
const CVE = "CVE-2026-69246";
const SOURCE = "PKSA-gcrk-3vtt-1r14";

interface Ids {
  readonly cve: string | null;
  readonly id: string;
  readonly link: string | null;
}

const CASES: readonly (readonly [string, Ids, readonly (readonly [string, string | null])[]])[] = [
  [
    "cve differs from id",
    { cve: CVE, id: SOURCE, link: LINK },
    [
      [CVE, null],
      [SOURCE, LINK],
    ],
  ],
  ["cve equals id", { cve: CVE, id: CVE, link: LINK }, [[CVE, LINK]]],
  ["cve is null", { cve: null, id: SOURCE, link: LINK }, [[SOURCE, LINK]]],
  [
    "link is null",
    { cve: CVE, id: SOURCE, link: null },
    [
      [CVE, null],
      [SOURCE, null],
    ],
  ],
  [
    "link is unsafe",
    { cve: CVE, id: SOURCE, link: "javascript:alert(1)" },
    [
      [CVE, null],
      [SOURCE, null],
    ],
  ],
];

/** B, with its one deciding advisory carrying the given ids. */
function decidingWith(ids: Ids): { finding: Finding; run: Run; metadata: RepositoryMetadata | null } {
  const found = modelCases().find((c) => c.name === "B");
  if (found === undefined) throw new Error("no case B");
  const { finding, run, metadata } = structuredClone({
    finding: found.finding,
    run: found.run,
    metadata: found.metadata,
  });
  const rows = advisoryRows(finding) as S9row[];
  const at = rows.findIndex((row) => row.deciding);
  rows[at] = { ...(rows[at] as S9row), ...ids };
  return { finding, run, metadata };
}

describe("advisorySourceIds", () => {
  test.each(CASES)("%s", (_name, ids, expected) => {
    expect(advisorySourceIds(ids).map(({ text, href }) => [text, href])).toEqual(expected);
  });
});

describe("the Security list of the detail sheet", () => {
  test.each(CASES)("%s", (_name, ids, expected) => {
    const { finding, run, metadata } = decidingWith(ids);
    const row = securityBlock(finding, run, metadata).rows.find((r) => r.deciding);

    expect(row?.ids.map(({ text, href, linkName }) => [text, href, linkName])).toEqual(
      expected.map(([text, href]) => [text, href, newTab(text)]),
    );
  });
});

describe("the deciding advisory of the verdict line", () => {
  test.each(CASES)("%s", (_name, ids, expected) => {
    const { finding, run, metadata } = decidingWith(ids);
    const block = verdictBlock(finding, run, metadata);
    const reading = [block.inline, ...block.readings].find((r) => r?.advisory != null);
    if (reading == null) throw new Error("B has no deciding advisory reading");
    const rich = readingRich(reading);
    const linked = rich.flatMap((piece) =>
      typeof piece === "object" && "href" in piece ? [[piece.text, piece.href, piece.name]] : [],
    );

    expect(linked).toEqual(
      expected.flatMap(([text, href]) => (href === null ? [] : [[text, href, newTab(text)]])),
    );
    expect(plain(rich)).toContain(`(${expected.map(([text]) => text).join(" ")}:`);
  });
});
