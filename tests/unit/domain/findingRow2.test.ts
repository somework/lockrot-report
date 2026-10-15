import { describe, expect, it } from "vitest";
import {
  ageReading,
  ageScaleLabel,
  cappedPackages,
  flagPills,
  gradeTone,
  ignoredNote,
  maintenanceAccepted,
  nextStepWords,
  reachWord,
  runSegments,
  uncheckedNote,
} from "../../../src/domain/findingRow2";
import type { Finding, Report2, TermSecurity } from "../../../src/model/report2";
import { isScoreGraded, isTermSecurity } from "../../../src/model/report2";
import { readContractJson } from "../words/recorded";

function report(name: string): Report2 {
  return readContractJson("report-2", `${name}.json`) as Report2;
}

function finding(doc: Report2, pkg?: string): Finding {
  const found = pkg === undefined ? doc.findings[0] : doc.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no finding ${pkg ?? "first"}`);
  return found;
}

const composite = report("composite");
const run = composite.run;

function securityTermOf(f: Finding): TermSecurity {
  const term = isScoreGraded(f.score) ? f.score.terms.find(isTermSecurity) : undefined;
  if (term === undefined) throw new Error(`${f.package} has no security term`);
  return term;
}

function pillsOf(doc: Report2, pkg?: string) {
  return flagPills(finding(doc, pkg), doc.run);
}

describe("flagPills", () => {
  it("words each headline and tones a maintenance pill by its band in the score model", () => {
    const pills = pillsOf(composite, "symfony/monolog-bridge");
    expect(pills.map((p) => [p.id, p.word, p.band])).toEqual([
      ["left-behind", "6.9 y", run.score_model.flags.find((f) => f.id === "left-behind")?.band],
      ["old-promise", "PHP 5", run.score_model.flags.find((f) => f.id === "old-promise")?.band],
      ["vulnerable", "1", run.score_model.severities.find((s) => s.id === "high")?.band],
    ]);
  });

  it("words a reason headline with the page's word and an advisory headline with its count", () => {
    expect(pillsOf(composite, "symfony/debug")[0]?.word).toBe("archived");
    expect(pillsOf(composite, "friendsofsymfony/oauth-server-bundle")[0]?.word).toBe("snapshot");
    expect(pillsOf(composite, "twig/twig")[0]?.word).toBe("15");
  });

  it("tones vulnerable by its security term, never by security.worst", () => {
    const term = securityTermOf(finding(composite, "twig/twig"));
    const severity = run.score_model.severities.find((s) => s.id === term.severity);
    expect(pillsOf(composite, "twig/twig")[0]?.band).toBe(severity?.band);
  });

  it("tones a security term nothing fixes by band_no_reachable_fix and names the deciding advisory", () => {
    const blocked = report("A-blocked-dagger");
    const [pill] = flagPills(finding(blocked), blocked.run);
    const term = securityTermOf(finding(blocked));
    const severity = blocked.run.score_model.severities.find((s) => s.id === term.severity);
    expect(pill?.band).toBe(severity?.band_no_reachable_fix);
    expect(pill?.noFix).toMatch(/^no release fixing CVE-\S+ runs on PHP \S+$/);
    expect(pill?.noFix).toContain(blocked.run.target_php);
  });

  it("says no release fixes it when one advisory counts and none fixes it", () => {
    const either = report("either-low-dev-dagger");
    expect(flagPills(finding(either), either.run).find((p) => p.id === "vulnerable")?.noFix).toBe(
      "no release fixes it",
    );
  });

  it("names the deciding advisory when more than one counts and none fixes it", () => {
    const unrated = report("unrated-dagger");
    expect(flagPills(finding(unrated), unrated.run)[0]?.noFix).toMatch(/^no release fixes \S+$/);
  });

  it("puts a flag no term names last, untoned, with the word accepted and who accepted it", () => {
    const accepted = report("B-accepted-dagger");
    const pills = flagPills(finding(accepted), accepted.run);
    expect(pills.map((p) => [p.id, p.word, p.accepted])).toEqual([
      ["vulnerable", "1", false],
      ["left-behind", "accepted", true],
      ["old-promise", "accepted", true],
    ]);
    expect(pills[1]?.band).toBeNull();
    expect(pills[1]?.title).toBe(finding(accepted).allowlist?.reason);
  });

  it("marks a known flag with a tick and hidden words, a covered one with the flag that covers it", () => {
    const pills = pillsOf(report("B-baselined-dagger"));
    expect(pills.map((p) => p.mark)).toEqual([
      { tick: true, word: null, hidden: "known to the baseline" },
      { tick: true, word: null, hidden: "covered by the recorded left-behind" },
      { tick: false, word: "new", hidden: " since the baseline" },
    ]);
  });

  it("marks vulnerable with the worst state of its advisories", () => {
    const doc = report("A-baselined-dagger");
    const states = finding(doc)
      .signals.filter((s) => s.id === "S9")
      .flatMap((s) => (s.data as { advisories: { baseline: { state: string } | null }[] }).advisories)
      .map((row) => row.baseline?.state);
    expect(states).toContain("re_rated");
    expect(flagPills(finding(doc), doc.run)[0]?.mark).toEqual({
      tick: false,
      word: "re-rated",
      hidden: " since the baseline",
    });
  });

  it("draws no mark without a baseline", () => {
    expect(pillsOf(composite, "symfony/monolog-bridge").map((p) => p.mark)).toEqual([null, null, null]);
  });
});

describe("maintenanceAccepted", () => {
  it("says who accepted every maintenance flag, and nothing for a partial entry", () => {
    expect(maintenanceAccepted(finding(composite, "symfony/polyfill-intl-idn"))).toBe(
      "maintenance accepted (lockrot's list)",
    );
    expect(maintenanceAccepted(finding(report("D-partial-dagger")))).toBeNull();
    expect(maintenanceAccepted(finding(composite, "twig/twig"))).toBeNull();
  });
});

describe("reachWord", () => {
  it("says direct, via the dependents, or unreached, with dev after", () => {
    expect(reachWord(finding(composite, "twig/twig"))).toBe("direct");
    expect(reachWord(finding(composite, "symfony/polyfill-intl-idn"))).toBe("via guzzlehttp/guzzle");
    expect(reachWord(finding(report("unreached")))).toBe("unreached");
    expect(reachWord(finding(report("B-dev-dagger")))).toBe("direct · dev");
  });
});

describe("ageReading", () => {
  it("takes the first reading with a level, against the release thresholds", () => {
    const reading = ageReading(finding(composite, "symfony/debug"), run);
    expect(reading).toMatchObject({ kind: "branch_release", level: "high" });
    expect(reading?.warn).toBe(run.thresholds?.["release-warn-years"]);
    expect(reading && ageScaleLabel(reading)).toMatch(
      /^installed branch last released \d+\.\d years ago; warn at \S+ years, high at \S+$/,
    );
  });

  it("has no reading when no level is set", () => {
    expect(ageReading(finding(composite, "twig/twig"), run)).toBeNull();
  });

  it("has no reading when the run has no thresholds", () => {
    expect(ageReading(finding(composite, "symfony/debug"), { ...run, thresholds: null })).toBeNull();
  });
});

describe("nextStepWords", () => {
  const words = (name: string, pkg?: string) => {
    const doc = report(name);
    return nextStepWords(finding(doc, pkg), doc.run);
  };

  it("words each kind of the composite", () => {
    expect(nextStepWords(finding(composite, "twig/twig"), run)).toEqual({
      text: "php floor raise",
      title: null,
      href: null,
      held: true,
    });
    expect(nextStepWords(finding(composite, "symfony/monolog-bridge"), run).text).toBe("require ^5.4.52");
    expect(nextStepWords(finding(composite, "symfony/monolog-bridge"), run).held).toBe(false);
    expect(nextStepWords(finding(composite, "symfony/debug"), run).text).toBe("→ symfony/error-handler");
    expect(nextStepWords(finding(composite, "friendsofsymfony/oauth-server-bundle"), run).text).toBe(
      `no tag runs on ${run.target_php}`,
    );
    expect(nextStepWords(finding(composite, "tubalmartin/cssmin"), run).text).toBe(
      `test on ${run.target_php}`,
    );
    expect(nextStepWords(finding(composite, "symfony/yaml"), run).text).toBe("composer update");
  });

  it("says move to rather than require for a package the project does not require", () => {
    expect(words("flysystem").text).toMatch(/^move to \S+$/);
  });

  it("words a tag, an alternative, no fix, no single fix and the no-move reasons", () => {
    expect(words("G-tag-dagger").text).toMatch(/^require tag \S+/);
    expect(words("cache-subscriber").text).toBe("find an alternative");
    expect(words("either-low-dev-dagger").text).toBe("no fix");
    expect(words("unrated-dagger").text).toBe("see advisories");
    expect(words("ignored-marking-stale-dagger").text).toBe("—");
    expect(words("local-path-advisory").text).toBe("your own package");
    expect(words("pinned-unread").text).toBe("releases not read");
    expect(words("affected-range-unknown-dagger").text).toBe("no move");
  });

  it("words a blocked move that is not a snapshot's by its branch and the php it needs", () => {
    expect(words("A-blocked-dagger").text).toMatch(
      /^\S+ (needs php \S+; target \S+ runs no fixing release|does not run on \S+)$/,
    );
  });

  it("shows the move's own text for a kind it does not know", () => {
    const twig = finding(composite, "twig/twig");
    const odd = { ...twig, next_step: twig.next_step && { ...twig.next_step, kind: "rewrite" } };
    expect(nextStepWords(odd, run).text).toBe(twig.next_step?.text);
  });

  it("ellipsises a long suggestion and keeps the whole text as its title", () => {
    const debug = finding(composite, "symfony/debug");
    const step = debug.next_step;
    if (step === null || step.replacement === null) throw new Error("composite debug has a replacement");
    const suggestion = "rewrite the error handling on top of a maintained component of your choice";
    const odd = {
      ...debug,
      next_step: { ...step, replacement: { ...step.replacement, package: null, suggestion, url: null } },
    };
    const said = nextStepWords(odd, run);
    expect(said.text).toBe(`suggests: ${suggestion.slice(0, 40)}…`);
    expect(said.title).toBe(suggestion);
  });
});

describe("runSegments", () => {
  it("groups three alike rows on the part that decides, never on the verdict", () => {
    const low = finding(composite, "symfony/yaml");
    const rows = [
      low,
      { ...low, package: "a/b" },
      { ...low, package: "c/d" },
      finding(composite, "tubalmartin/cssmin"),
    ];
    expect(runSegments(rows).map((s) => [s.key, s.findings.length])).toEqual([
      ["vulnerable", 3],
      [null, 1],
    ]);
  });

  it("keeps two alike rows plain", () => {
    const rows = [finding(composite, "symfony/yaml"), finding(composite, "symfony/polyfill-intl-idn")];
    expect(runSegments(rows).map((s) => s.key)).toEqual([null]);
  });
});

describe("the notes above the list", () => {
  it("counts the ignored advisories and the packages they sit on", () => {
    const doc = readContractJson("model-only", "ok-ignored-dagger.json") as Report2;
    const note = ignoredNote(doc);
    const total = doc.findings.reduce((n, f) => n + f.security.ignored_count, 0);
    expect(total).toBeGreaterThan(0);
    expect(note?.text).toMatch(
      new RegExp(`^${total} advisor(y is|ies are) ignored by Composer's audit policy`),
    );
    expect(note?.packages).toEqual(
      doc.findings.filter((f) => f.security.ignored_count > 0).map((f) => f.package),
    );
    expect(ignoredNote(composite)).toBeNull();
  });

  it("counts the packages whose advisories were not checked", () => {
    const doc = report("B-offline-dagger");
    const unchecked = doc.findings.filter((f) => f.security.status === "unchecked").map((f) => f.package);
    expect(unchecked.length).toBeGreaterThan(0);
    expect(uncheckedNote(doc)?.packages).toEqual(unchecked);
    expect(uncheckedNote(doc)?.text).toMatch(/^\d+ packages? (was|were) not checked for advisories$/);
    expect(uncheckedNote(composite)).toBeNull();
  });
});

describe("gradeTone and cappedPackages", () => {
  it("tones each graded band and keeps an unknown or missing band neutral", () => {
    expect(run.graded_verdicts.map(gradeTone)).toEqual(["crit", "high", "med", "low"]);
    expect(gradeTone("dire")).toBe("low");
    expect(gradeTone(null)).toBe("low");
  });

  it("names three packages and counts the rest", () => {
    expect(cappedPackages(["a", "b", "c"])).toEqual({ shown: ["a", "b", "c"], more: null });
    expect(cappedPackages(["a", "b", "c", "d", "e"])).toEqual({ shown: ["a", "b", "c"], more: "and 2 more" });
  });
});
