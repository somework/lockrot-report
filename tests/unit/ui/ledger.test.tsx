import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import { App } from "../../../src/ui/App";
import { CleanMark } from "../../../src/ui/ledger/CleanMark";
import type { WaffleRun } from "../../../src/domain/summary";
import { Waffle } from "../../../src/ui/ledger/Waffle";

afterEach(cleanup);

function squares(waffle: Element | null): string[] {
  return [...(waffle?.children ?? [])].map((cell) => cell.className.replace("waffle-cell ", ""));
}

describe("Waffle", () => {
  const runs: readonly WaffleRun[] = [
    { tone: "crit", count: 1 },
    { tone: "high", count: 3 },
    { tone: "med", count: 1 },
    { tone: "low", count: 2 },
  ];

  it("draws one square per package, the flagged ones first in their run's tone, then the rest quiet", () => {
    const { container } = render(<Waffle runs={runs} total={202} />);

    const cells = squares(container.querySelector(".waffle"));
    expect(cells).toHaveLength(202);
    expect(cells.slice(0, 7)).toEqual([
      "tone-crit",
      "tone-high",
      "tone-high",
      "tone-high",
      "tone-med",
      "tone-low",
      "tone-low",
    ]);
    expect(cells.slice(7).every((cell) => cell === "waffle-rest")).toBe(true);
  });

  it("is hidden from assistive tech, since the figure beside it says every number", () => {
    const { container } = render(<Waffle runs={runs} total={202} />);

    expect(container.querySelector(".waffle")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("sets its row counts as numbers, growing rows rather than squares with the lock", () => {
    const { container } = render(<Waffle runs={runs} total={202} />);
    const waffle = container.querySelector<HTMLElement>(".waffle");

    // ceil(202 / columns): 26 columns in the narrow and mid budgets, 38 wide, 50 extra wide.
    expect(
      ["narrow", "mid", "wide", "xwide"].map((b) => waffle?.style.getPropertyValue(`--rows-${b}`)),
    ).toEqual(["8", "8", "6", "5"]);
  });

  it("draws a small lock as one short row", () => {
    const { container } = render(<Waffle runs={[]} total={4} />);
    const waffle = container.querySelector<HTMLElement>(".waffle");

    expect(waffle?.querySelectorAll(".waffle-cell")).toHaveLength(4);
    expect(waffle?.style.getPropertyValue("--rows-xwide")).toBe("1");
  });

  it("marks a waffle with nothing flagged as clean", () => {
    const { container } = render(<Waffle runs={[]} total={3} />);

    expect(container.querySelector(".waffle")?.classList.contains("is-clean")).toBe(true);
  });

  it("never draws fewer squares than the flagged runs add up to", () => {
    const { container } = render(<Waffle runs={[{ tone: "high", count: 5 }]} total={3} />);

    expect(container.querySelectorAll(".waffle-cell")).toHaveLength(5);
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

describe("the overview band's grade chips and waffle", () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("1181"),
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

  it("keeps a grade nothing holds as a dimmed chip, not a missing one", () => {
    render(<App model={composite()} />);

    // composite grades 3 critical, 2 high, 0 medium, 2 low.
    const grades = within(screen.getByRole("group", { name: "Grade" }));
    expect(grades.getByRole("button", { name: "medium 0" }).className).toContain("legend-btn-dim");
    expect(grades.getByRole("button", { name: "high 2" }).className).not.toContain("legend-btn-dim");
  });

  it("draws the waffle in the grades' tones, most urgent first", () => {
    render(<App model={composite()} />);

    expect(squares(document.querySelector(".overview2 .waffle"))).toEqual([
      "tone-crit",
      "tone-crit",
      "tone-crit",
      "tone-high",
      "tone-high",
      "tone-low",
      "tone-low",
    ]);
  });
});
