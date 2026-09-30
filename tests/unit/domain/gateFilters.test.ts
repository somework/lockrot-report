import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeFilters, applyFilters, filtersFor, railGroups } from "../../../src/domain/filters";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { parseHash, serializeHash } from "../../../src/state/hash";
import { EMPTY_FILTERS, INITIAL_STATE, type State } from "../../../src/state/types";

function loadModel(name: string): Model {
  const result = normalize(JSON.parse(readFileSync(`fixtures/bundles/${name}.json`, "utf8")));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

const FAILS: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, gate: ["fails"] } };

describe("the gate filter (PD-GATE-4)", () => {
  it("lists exactly the findings whose own gate fails, on each tab's population", () => {
    const model = loadModel("koel_no-token-unchecked-0.13");
    expect(applyFilters(model, FAILS, "findings")).toHaveLength(2);
    expect(applyFilters(model, FAILS, "packages")).toHaveLength(173);
  });

  it("is a rail row only on a run that failed, counted over the tab", () => {
    const failing = loadModel("wallabag_baseline-older-0.13");
    const gate = railGroups(failing, INITIAL_STATE).find((group) => group.group === "gate");
    expect(gate?.title).toBe("This run");
    expect(gate?.rows).toEqual([{ key: "fails", label: "Fails this run", count: 12, on: false }]);
    for (const name of [
      "koel_koel-0.13",
      "mini-0.13-gate-null",
      "wallabag_wallabag",
      "wallabag_generate-baseline-0.13",
    ]) {
      expect(
        railGroups(loadModel(name), INITIAL_STATE).some((group) => group.group === "gate"),
        name,
      ).toBe(false);
    }
  });

  it("names itself in the active-filters line", () => {
    expect(activeFilters(FAILS.filters)).toEqual([
      { group: "gate", key: "fails", groupLabel: "This run", label: "fails" },
    ]);
  });

  it("an address keeps it only where the run failed, and only its one key", () => {
    const failing = loadModel("wallabag_baseline-older-0.13");
    expect(filtersFor(failing, FAILS.filters)).toBe(FAILS.filters);
    expect(filtersFor(failing, { ...EMPTY_FILTERS, gate: ["fails", "later"] }).gate).toEqual(["fails"]);
    for (const name of ["koel_koel-0.13", "mini-0.13-gate-null", "wallabag_wallabag"]) {
      expect(filtersFor(loadModel(name), FAILS.filters).gate, name).toEqual([]);
    }
    const other = { ...EMPTY_FILTERS, prio: ["high"] };
    expect(filtersFor(loadModel("wallabag_wallabag"), other)).toBe(other);
  });

  it("round-trips through the address, written after every older group", () => {
    const state: State = {
      ...INITIAL_STATE,
      filters: { ...EMPTY_FILTERS, since: ["new"], gate: ["fails"], prio: ["high"] },
    };
    expect(serializeHash(state)).toBe("prio=high&since=new&gate=fails");
    expect(parseHash("#gate=fails&view=packages", INITIAL_STATE)).toMatchObject({
      view: "packages",
      filters: { gate: ["fails"] },
    });
  });
});
