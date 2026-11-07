// A focused row of every list says the package grade, not only its name, as a Findings row does.
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import type { Finding } from "../../../src/model/report";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

afterEach(cleanup);

function composite(): Model {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function findingOf(model: Model, pkg: string | null): Finding {
  const found = model.report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no finding ${String(pkg)}`);
  return found;
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe("the description of a focused row", () => {
  test("an All packages row reads its score and its verdict", () => {
    history.replaceState(null, "", "/report.html#view=packages");
    const model = composite();
    render(<App model={model} />);
    const rows = [...document.querySelectorAll<HTMLElement>("table.p2-table tbody tr[data-pkg]")];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const finding = findingOf(model, row.getAttribute("data-pkg"));
      expect(
        screen.getByRole("row", {
          name: finding.package,
          description: `Score ${String(finding.score.total)} ${finding.verdict}`,
        }),
      ).toBe(row);
    }
  });

  test("a Blast radius requirement row reads its own grade and what it lists", () => {
    history.replaceState(null, "", "/report.html#view=radius");
    const model = composite();
    render(<App model={model} />);
    const rows = [...document.querySelectorAll<HTMLElement>("li.r2-row")];
    const graded = rows.filter((row) =>
      model.report.findings.some((f) => f.package === row.getAttribute("data-pkg") && f.verdict !== "ok"),
    );

    expect(graded.length).toBeGreaterThan(0);
    for (const row of graded) {
      const finding = findingOf(model, row.getAttribute("data-pkg"));
      expect(
        screen.getByRole("listitem", {
          name: finding.package,
          description: (text) => text.startsWith(`${finding.verdict} itself `),
        }),
      ).toBe(row);
    }
    expect(screen.getAllByRole("listitem", { description: /\d+ flagged/ })).toEqual(rows);
  });

  test("a package listed under a Blast radius row reads its score and its verdict", () => {
    history.replaceState(null, "", "/report.html#view=radius");
    const model = composite();
    render(<App model={model} />);
    const toggle = document.querySelector<HTMLElement>("li.r2-row button.r2-tog[aria-expanded='false']");
    if (toggle !== null) fireEvent.click(toggle);
    const kids = [...document.querySelectorAll<HTMLElement>("li.r2-kid")];

    expect(kids.length).toBeGreaterThan(0);
    for (const kid of kids) {
      const finding = findingOf(model, kid.getAttribute("data-pkg"));
      expect(
        screen.getByRole("listitem", {
          name: finding.package,
          description: `score ${String(finding.score.total)} ${finding.verdict}`,
        }),
      ).toBe(kid);
    }
  });
});
