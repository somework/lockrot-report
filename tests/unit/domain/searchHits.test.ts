import { describe, expect, it } from "vitest";
import { matchesFinding, parseQuery, searchFields } from "../../../src/domain/query";
import {
  EXCERPT_REACH,
  evidenceExcerpt,
  searchHit,
  searchSplit,
  searchSplitPhrase,
} from "../../../src/domain/searchHits";
import { makeFinding } from "./fixtures";

/** wallabag/rulerz's evidence, as the wallabag fixture carries it (shortened after the list). */
const RULERZ_EVIDENCE =
  "pinned to branch snapshot dev-master; pulls in 14 flagged packages: hoa/compiler (abandoned), hoa/consistency (abandoned), hoa/event (abandoned) and 11 more";

const hoaCompiler = makeFinding({
  package: "hoa/compiler",
  verdict: "abandoned",
  evidence: "marked abandoned by its repository; last release 2017-08-08",
});
const rulerz = makeFinding({
  package: "wallabag/rulerz",
  verdict: "pinned",
  version: "dev-master",
  evidence: RULERZ_EVIDENCE,
});
const bundle = makeFinding({
  package: "wallabag/rulerz-bundle",
  verdict: "pinned",
  evidence: RULERZ_EVIDENCE,
});

function text(excerpt: ReturnType<typeof evidenceExcerpt>): string {
  if (excerpt === null) return "<none>";
  return `${excerpt.cutStart ? "…" : ""}${excerpt.before}[${excerpt.hit}]${excerpt.after}${excerpt.cutEnd ? "…" : ""}`;
}

describe("searchFields", () => {
  it("joins into exactly the haystack legacy searched (report.js:207)", () => {
    const f = makeFinding();
    const joined = searchFields(f)
      .map(([, value]) => value)
      .join(" ");
    expect(joined).toBe(`${f.package} ${f.version} ${f.verdict} ${f.evidence}`);
  });
});

describe("evidenceExcerpt", () => {
  it("quotes the fact that holds the hit, from its start, and cuts the far side at a word", () => {
    expect(text(evidenceExcerpt(RULERZ_EVIDENCE, "hoa/"))).toBe(
      "pulls in 14 flagged packages: [hoa/]compiler (abandoned)…",
    );
  });

  it("never runs across the '; ' into the fact before or after", () => {
    const excerpt = evidenceExcerpt("archived on GitHub; last push 2021; no stable release", "push");
    expect(text(excerpt)).toBe("last [push] 2021");
  });

  it("cuts a long lead-in at a word boundary and marks it", () => {
    const evidence = "one two three four five six seven eight nine ten eleven twelve NEEDLE after";
    const excerpt = evidenceExcerpt(evidence, "needle");
    expect(excerpt?.cutStart).toBe(true);
    expect(excerpt?.before.length).toBeLessThanOrEqual(EXCERPT_REACH);
    expect(excerpt?.before.startsWith(" ")).toBe(false);
    // The evidence's own case, though the search is lower-case.
    expect(excerpt?.hit).toBe("NEEDLE");
    expect(text(excerpt)).toBe("…eight nine ten eleven twelve [NEEDLE] after");
  });

  it("drops the punctuation a cut end would leave dangling", () => {
    const excerpt = evidenceExcerpt("needle a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p", "needle", 10);
    expect(excerpt?.cutEnd).toBe(true);
    expect(excerpt?.after.endsWith(",")).toBe(false);
  });

  it("is null when the evidence does not hold the word, or the word is empty", () => {
    expect(evidenceExcerpt(RULERZ_EVIDENCE, "symfony")).toBeNull();
    expect(evidenceExcerpt(RULERZ_EVIDENCE, "")).toBeNull();
  });

  it("quotes the first occurrence only, its lead-in cut to the reach", () => {
    const excerpt = evidenceExcerpt(RULERZ_EVIDENCE, "abandoned");
    expect(excerpt?.cutStart).toBe(true);
    expect(excerpt?.before).toBe("flagged packages: hoa/compiler (");
  });
});

describe("searchHit", () => {
  it("is null with no free text, whatever the field terms", () => {
    expect(searchHit(rulerz, parseQuery(""))).toBeNull();
    expect(searchHit(rulerz, parseQuery("verdict:pinned"))).toBeNull();
  });

  it("is null for a package the search does not list — it agrees with matchesFinding", () => {
    const terms = parseQuery("symfony");
    expect(matchesFinding(rulerz, terms)).toBe(false);
    expect(searchHit(rulerz, terms)).toBeNull();
  });

  it("says name when the package name holds the word, even if the evidence does too", () => {
    expect(searchHit(hoaCompiler, parseQuery("hoa/"))).toEqual({ field: "name", term: null, excerpt: null });
  });

  it("says evidence, with the word and its excerpt, when only the evidence holds it", () => {
    const hit = searchHit(rulerz, parseQuery("HOA/"));
    expect(hit?.field).toBe("evidence");
    expect(hit?.term).toBe("hoa/");
    expect(text(hit?.excerpt ?? null)).toBe("pulls in 14 flagged packages: [hoa/]compiler (abandoned)…");
  });

  it("says version or verdict when that is the least visible part a word needed", () => {
    expect(searchHit(rulerz, parseQuery("dev-master"))?.field).toBe("version");
    expect(searchHit(rulerz, parseQuery("rulerz pinned"))?.field).toBe("verdict");
    expect(searchHit(rulerz, parseQuery("pinned"))?.excerpt).toBeNull();
  });

  it("with several words, takes the least visible part and quotes the first evidence-only word", () => {
    const hit = searchHit(rulerz, parseQuery("rulerz hoa/event"));
    expect(hit?.field).toBe("evidence");
    expect(hit?.term).toBe("hoa/event");
  });
});

describe("searchSplit / searchSplitPhrase", () => {
  const listed = [hoaCompiler, rulerz, bundle];

  it("counts what is on the row and names the packages that only mention the word", () => {
    const split = searchSplit(listed, "hoa/");
    expect(split).toMatchObject({
      total: 3,
      onRow: 1,
      mentions: ["wallabag/rulerz", "wallabag/rulerz-bundle"],
    });
    // Findings/Packages (`unit` omitted): `split.total` (3) is always the same number the tab's own
    // "N of M" line already gives (PD-SEARCH-1 polish item 2), so the phrase never repeats it — it
    // opens straight on the split, naming the query itself in the "mention" part since there is no
    // longer an intro sentence for a pronoun to read back to (item 4 also keeps the query's own
    // case, here already lower).
    expect(searchSplitPhrase(split)).toEqual({
      text: "1 on the row, 2 mention “hoa/”",
      names: ["wallabag/rulerz", "wallabag/rulerz-bundle"],
    });
  });

  it("names no package past three, only counts them", () => {
    const many = [1, 2, 3, 4].map((n) => makeFinding({ package: `x/p${n}`, evidence: "pulls in hoa/regex" }));
    const phrase = searchSplitPhrase(searchSplit([hoaCompiler, ...many], "hoa/"));
    expect(phrase).toEqual({ text: "1 on the row, 4 mention “hoa/”", names: [] });
  });

  it("has nothing to say when every package was found on its own row, or none at all", () => {
    expect(searchSplitPhrase(searchSplit([hoaCompiler], "hoa/"))).toBeNull();
    expect(searchSplitPhrase(searchSplit([], "hoa/"))).toBeNull();
    expect(searchSplit(listed, "verdict:pinned")).toBeNull();
    expect(searchSplitPhrase(null)).toBeNull();
  });

  it("a version or verdict hit is 'on the row' too (PD-SEARCH-1 polish item 3)", () => {
    // "dev-master" is rulerz's own version; "pinned" is both rulerz's and bundle's own verdict. Both
    // rows show the word that matched them without any help from this line, so there is nothing to
    // split out — same as a name-only match always was.
    expect(searchSplitPhrase(searchSplit([rulerz], "dev-master"))).toBeNull();
    expect(searchSplitPhrase(searchSplit([rulerz, bundle], "pinned"))).toBeNull();
  });

  it("singularises and quotes the query itself (not a pronoun) when there is no intro sentence left", () => {
    expect(searchSplitPhrase(searchSplit([rulerz], "hoa/"))?.text).toBe("1 mentions “hoa/”");
    expect(searchSplitPhrase(searchSplit([rulerz], "wallabag hoa/event"))?.text).toBe(
      "1 mentions “wallabag hoa/event”",
    );
  });

  it("keeps the reader's own case in the echoed query (PD-SEARCH-1 polish item 4)", () => {
    const split = searchSplit(listed, "HOA/");
    expect(split?.query).toBe("HOA/");
    // Matching itself is still case-insensitive: the same three packages are found either way.
    expect(split).toMatchObject({ total: 3, onRow: 1 });
    expect(searchSplitPhrase(split)?.text).toBe("1 on the row, 2 mention “HOA/”");
  });

  it("keeps each word's own case in a multi-word query, key:value tokens dropped from the echo", () => {
    expect(searchSplit(listed, "HOA/ verdict:abandoned Event")?.query).toBe("HOA/ Event");
  });

  it("names its unit and keeps its own count on the Advisories tab (PD-SEARCH-1 polish item 2)", () => {
    const phrase = searchSplitPhrase(searchSplit(listed, "hoa/"), {
      one: "package",
      many: "packages",
    });
    expect(phrase?.text).toBe("3 packages match “hoa/”: 1 on the row, 2 mention it");
  });
});
