// A row that takes focus says, by its own role and description, that Enter opens its package
// (PD-ROWS-20).
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed, report2Pages } from "../../../scripts/report2-embed";
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
  test("is a row of a treegrid", () => {
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
    expect(
      rows.filter((row) => row.closest('[role="treegrid"]') === null).map((row) => row.dataset.pkg),
    ).toEqual([]);
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

describe("the Blast radius trees (ARIA tree pattern: one Tab stop per tree)", () => {
  function wallabagTrees(hash: string): HTMLElement[] {
    const page = report2Pages().find((p) => p.name === "report2-baselined-wallabag-2.6");
    if (page === undefined) throw new Error("no baselined-wallabag-2.6 page");
    const result = normalize(page.embed);
    if (!result.ok) throw new Error(result.error.message);
    history.replaceState(null, "", `/report.html#view=radius${hash}`);
    render(<App model={result.model} />);
    return [...document.querySelectorAll<HTMLElement>('[data-surface="radius"] [role="tree"]')];
  }

  const stops = (tree: HTMLElement): string[] =>
    [...tree.querySelectorAll<HTMLElement>('[role="treeitem"][tabindex="0"]')].map(
      (item) => item.dataset.pkg ?? "",
    );

  test("gives the one-each tree its own Tab stop, on its first row", () => {
    const [lead, singles] = wallabagTrees("");

    expect(lead === undefined || singles === undefined).toBe(false);
    expect(stops(lead as HTMLElement)).toHaveLength(1);
    expect(stops(singles as HTMLElement)).toEqual([
      singles?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg,
    ]);
  });

  test("keeps a Tab stop in the first tree while the open package sits in the one-each tree", () => {
    const probe = wallabagTrees("");
    const singlesFirst = probe[1]?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg ?? "";
    const leadFirst = probe[0]?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg ?? "";
    cleanup();

    const [lead, singles] = wallabagTrees(`&pkg=${encodeURIComponent(singlesFirst)}`);

    expect(singlesFirst).not.toBe("");
    expect(stops(lead as HTMLElement)).toEqual([leadFirst]);
    expect(stops(singles as HTMLElement)).toEqual([singlesFirst]);
  });

  test("the skip link still moves focus to the open package's row in the one-each tree", () => {
    const probe = wallabagTrees("");
    const singlesFirst = probe[1]?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg ?? "";
    cleanup();
    wallabagTrees(`&pkg=${encodeURIComponent(singlesFirst)}`);

    fireEvent.click(screen.getByRole("link", { name: "Skip to the list" }));

    expect(document.activeElement?.closest('[role="tree"]')).toBe(
      document.querySelectorAll('[data-surface="radius"] [role="tree"]')[1],
    );
    expect((document.activeElement as HTMLElement | null)?.dataset.pkg).toBe(singlesFirst);
  });
});
