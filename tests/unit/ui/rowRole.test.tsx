// A row that takes focus says, by its own role and description, that Enter opens its package
// (PD-ROWS-20).
import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

afterEach(cleanup);

function composite(): Model {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const description = (row: Element): string =>
  (row.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

function focusableRows(view: string): HTMLElement[] {
  history.replaceState(null, "", `/report.html#view=${view}`);
  render(<App model={composite()} />);
  return [...document.querySelectorAll<HTMLElement>('[role="tabpanel"] [data-pkg]')];
}

describe.each([["findings"], ["advisories"], ["packages"]])("a focusable row on %s", (view) => {
  test("is a row of a grid", () => {
    const rows = focusableRows(view);

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows
        .filter((row) => !["0", "-1"].includes(row.getAttribute("tabindex") ?? ""))
        .map((row) => row.dataset.pkg),
    ).toEqual([]);
    expect(rows.filter((row) => row.getAttribute("role") !== "row").map((row) => row.dataset.pkg)).toEqual(
      [],
    );
    expect(rows.filter((row) => row.closest('[role="grid"]') === null).map((row) => row.dataset.pkg)).toEqual(
      [],
    );
  });
});

describe.each([["findings"], ["advisories"], ["packages"], ["radius"]])("a focusable row on %s", (view) => {
  test("says in its own description that Enter opens its package", () => {
    const rows = focusableRows(view);

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows
        .filter((row) => !description(row).includes("Press Enter on a row to open its package."))
        .map((row) => row.dataset.pkg),
    ).toEqual([]);
  });
});
