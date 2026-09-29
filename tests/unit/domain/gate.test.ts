import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateFact } from "../../../src/domain/gate";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";

function loadModel(name: string): Model {
  const result = normalize(JSON.parse(readFileSync(`fixtures/bundles/${name}.json`, "utf8")));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

describe("gateFact", () => {
  it("is null when the document states no fail-on", () => {
    expect(gateFact(loadModel("mini-no-fail-on"))).toBeNull();
    expect(gateFact(loadModel("mini-0.13-gate-null"))).toBeNull();
  });

  it("fail-on none without --strict-network: fails on no finding, and claims nothing about the exit", () => {
    const fact = gateFact(loadModel("wallabag_wallabag"));
    expect(fact?.label).toBe("no gate");
    expect(fact?.text).toBe(
      "This run was told --fail-on=none: it fails on no finding, and this page lists what it saw. " +
        "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    );
    expect(fact?.text).not.toContain("exits 0");
  });

  it("fail-on none with --strict-network: never 'no gate', says a failed lookup fails the run", () => {
    const fact = gateFact(loadModel("wallabag_offline-strict-0.13"));
    expect(fact?.label).toBe("gate: strict network");
    expect(fact?.text).toContain(
      "it fails on no finding, but --strict-network fails the run when a network lookup fails.",
    );
    expect(fact?.text).not.toMatch(/no gate|exits 0/i);
  });

  it("words the rule from run.fail_on_kind, the Run row's words", () => {
    expect(gateFact(loadModel("wallabag_baseline-older-0.13"))?.text).toMatch(
      /^This run was told --fail-on=high: it fails on a priority at least as high as high, unless the baseline already accepts the finding\. /,
    );
    expect(gateFact(loadModel("mini-0.13-gate-verdict"))?.text).toContain(
      "it fails on a verdict at least as severe as pinned",
    );
  });

  it("an unchecked threshold: 'carry' S10, never 'are with'", () => {
    const text = gateFact(loadModel("koel_no-token-unchecked-0.13"))?.text ?? "";
    expect(text).toContain("it fails on any finding whose check did not run.");
    expect(text).toContain("173 findings in this report carry a check that did not run (S10).");
    expect(text).not.toContain("are with");
    expect(text).not.toContain("reaches unchecked");
  });

  it("an unknown kind is shown as written, and its findings are only said to reach the value", () => {
    const text = gateFact(loadModel("mini-0.13-gate-unknown"))?.text ?? "";
    expect(text).toContain("it fails on findings that reach copyleft, another kind of threshold (licence)");
    expect(text).toContain("1 finding in this report reaches copyleft;");
    expect(text).not.toContain("is reaching");
  });

  it("a run that applies no fail-on judges no finding, whatever reaches it", () => {
    const text = gateFact(loadModel("wallabag_generate-baseline-0.13"))?.text ?? "";
    expect(text).toMatch(
      /^This run was told --fail-on=high, but as a generate_baseline run it judged no finding against it, so no finding fails it\. /,
    );
    expect(text).not.toContain("exits 1");
    expect(text).toContain("39 findings in this report are at or above high.");
  });

  it("names --strict-network beside a fail-on when the run had it", () => {
    expect(gateFact(loadModel("mini-0.13-edges"))?.text).toContain(
      "--strict-network also fails the run when a network lookup fails.",
    );
    expect(gateFact(loadModel("wallabag_baseline-older-0.13"))?.text).not.toContain("strict");
  });

  it("counts as not accepted only findings nothing exempts, naming another exemption as written", () => {
    const text = gateFact(loadModel("mini-0.13-edges"))?.text ?? "";
    expect(text).toContain(
      "14 findings in this report are at or above high; 10 of them are neither accepted in lockrot-baseline.json nor exempt for another reason (waiver).",
    );
  });
});
