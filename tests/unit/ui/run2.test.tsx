import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { ScoreModelLink } from "../../../src/ui/report/ScoreModelLink";
import { ReportContext } from "../../../src/ui/context";

function model(edit: (report: Report2) => void = () => undefined): Model {
  const embed = assembleEmbed("composite");
  edit(embed.report);
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function run(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-surface="run"]');
  if (found === null) throw new Error("no Run surface");
  return found;
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1181"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  history.replaceState(null, "", "/report.html#view=run");
});
afterEach(() => {
  cleanup();
});

describe("the Run tab of a report-2 document", () => {
  test("holds How the score works, the advisory lookup, the gate and the thresholds, in that order", () => {
    render(<App model={model()} />);

    const headings = [...run().querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(headings).toEqual([
      "How the score works · score model 1",
      "Advisory lookup",
      "Gate",
      "Thresholds in force",
    ]);
  });

  test("draws the weight and advisory tables with a row per weighted flag and per severity", () => {
    render(<App model={model()} />);

    const weights = within(run()).getByRole("table", { name: "Weights" });
    expect(within(weights).getAllByRole("row")).toHaveLength(7);
    const advisories = within(run()).getByRole("table", { name: "Advisories" });
    expect(within(advisories).getByRole("rowheader", { name: "unrated (counts as medium)" })).toBeTruthy();
  });

  test("folds the 16 rule rows, each linked to its docs anchor, a rule used on none muted", () => {
    render(<App model={model()} />);

    const fold = run().querySelector("details.run2-rules");
    expect(fold?.hasAttribute("open")).toBe(false);
    expect(fold?.querySelector("summary")?.textContent).toBe("The 16 rules");
    const rows = [...(fold?.querySelectorAll("li") ?? [])];
    expect(rows).toHaveLength(16);
    expect(rows[1]?.querySelector("a")?.getAttribute("href")).toBe(
      "https://lockrot.dev/verdicts/model-1/#score-lead-first",
    );
    expect(rows[0]?.classList.contains("is-muted")).toBe(true);
    expect(rows[1]?.classList.contains("is-muted")).toBe(false);
  });

  test("sets a rule id the page has no words for as code", () => {
    render(
      <App
        model={model((report) => {
          const rule = report.run.score_model.rules.find(({ id }) => id === "floor-once");
          if (rule === undefined) throw new Error("no floor-once rule");
          rule.id = "new-rule";
        })}
      />,
    );

    const code = run().querySelector("details.run2-rules li a code");
    expect(code?.textContent).toBe("new-rule");
  });

  test("prints gate.text as written", () => {
    render(<App model={model()} />);

    expect(
      within(run()).getByText(
        "gate: fails · --fail-on=high · 5 findings fail it · target php 8.4 (--target-php)",
      ),
    ).toBeTruthy();
  });

  test("lists the notes and the accepted unchecked checks when the run has them", () => {
    render(
      <App
        model={model((report) => {
          report.note_details = [
            {
              code: "not_from_composer_repository",
              text: "1 package is not from a Composer repository",
              docs_url: null,
              sets_network_failures: false,
              data: { package_count: 1, advisories_asked: true },
            },
          ];
          report.packages_unchecked_accepted = 1;
          const [first] = report.findings;
          if (first === undefined) throw new Error("no finding");
          first.unchecked_accepted = [
            {
              check: "advisories",
              reason: "no_feed",
              blocks: ["S9"],
              accepted_by: { scope: "package", value: first.package, reason: "vendored", expires: null },
            },
          ];
        })}
      />,
    );

    const text = run().textContent;
    expect(text).toContain("1 package is not from a Composer repository · advisories asked");
    expect(text).toContain("1 package with a check your accept-unchecked list accepted");
    expect(text).toContain(
      "twig/twig · advisories · no repository publishes advisories · package twig/twig · vendored",
    );
  });
});

describe("the link to How the score works", () => {
  test("opens the Run tab", () => {
    let view = "findings";
    render(
      <ReportContext.Provider
        value={
          { dispatch: (action: { type: string; view?: string }) => (view = action.view ?? view) } as never
        }
      >
        <ScoreModelLink />
      </ReportContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "How the score works ›" }));

    expect(view).toBe("run");
  });
});
