import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import { App } from "../../../src/ui/App";
import { CleanMark } from "../../../src/ui/ledger/CleanMark";
import type { WaffleRun } from "../../../src/domain/summary";
import { Waffle, WaffleKey } from "../../../src/ui/ledger/Waffle";

afterEach(cleanup);

function squares(waffle: Element | null): string[] {
  return [...(waffle?.children ?? [])].map((cell) => cell.className.replace("waffle-cell ", ""));
}

describe("Waffle", () => {
  const runs: readonly WaffleRun[] = [
    { verdict: "critical", label: "critical", tone: "crit", mark: "fill", count: 1 },
    { verdict: "high", label: "high", tone: "high", mark: "fill", count: 2 },
    { verdict: "unknown", label: "not judged", tone: "unk", mark: "hatch", count: 1 },
    { verdict: "finished", label: "allowlisted", tone: "none", mark: "ring-dot", count: 1 },
    { verdict: "ok", label: "ok", tone: "none", mark: "soft", count: 2 },
  ];

  it("draws one square per package in run order, each verdict in its own tone and mark", () => {
    const { container } = render(<Waffle runs={runs} />);

    expect(squares(container.querySelector(".waffle"))).toEqual([
      "is-fill tone-crit",
      "is-fill tone-high",
      "is-fill tone-high",
      "is-hatch tone-unk",
      "is-ring-dot tone-none",
      "is-soft tone-none",
      "is-soft tone-none",
    ]);
  });

  it("is hidden from assistive tech, since the grade line, chips and key say every number", () => {
    const { container } = render(<Waffle runs={runs} />);

    expect(container.querySelector(".waffle")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keys the squares no grade chip names", () => {
    const { container } = render(<WaffleKey runs={runs} />);

    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "not judged 1",
      "allowlisted 1",
      "ok 2",
    ]);
  });
});

describe("CleanMark", () => {
  it("is a decorative mark of the size it is given", () => {
    const { container } = render(<CleanMark size={30} />);
    const mark = container.querySelector("svg");

    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("width")).toBe("30");
  });
});

describe("the Overview tab's grade chips and waffle", () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: /1000px|1024px/.test(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    history.replaceState(null, "", "/report.html");
  });

  function composite() {
    const result = normalize(assembleEmbed("composite"));
    if (!result.ok) throw new Error(result.error.message);
    return result.model;
  }

  it("draws a chip only for a grade some package holds, on every page", () => {
    render(<App model={composite()} />);

    // composite grades 4 critical, 2 high, 0 medium, 3 low.
    const band = within(screen.getByRole("region", { name: "Overview" }));
    const grades = within(band.getByRole("group", { name: "Grade" }));
    expect(grades.queryByRole("link", { name: "medium 0" })).toBeNull();
    expect(grades.getAllByRole("link").map((chip) => chip.textContent)).toEqual([
      "critical 4",
      "high 2",
      "low 3",
    ]);
  });

  it("draws the waffle in the grades' tones, most urgent first", () => {
    render(<App model={composite()} />);

    expect(squares(document.querySelector(".ov .waffle")).slice(0, 9)).toEqual([
      "is-fill tone-crit",
      "is-fill tone-crit",
      "is-fill tone-crit",
      "is-fill tone-crit",
      "is-fill tone-high",
      "is-fill tone-high",
      "is-fill tone-low",
      "is-fill tone-low",
      "is-fill tone-low",
    ]);
  });
});
