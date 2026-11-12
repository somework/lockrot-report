// ArrowLeft and ArrowRight on a focused row, through the page's own key listener (PD-A11Y-ROLES-1).
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import { App } from "../../../src/ui/App";

afterEach(cleanup);

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

function open(view: string): void {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  history.replaceState(null, "", `/report.html#view=${view}`);
  render(<App model={result.model} />);
}

const press = (key: string): void => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
};

describe("on a Findings row", () => {
  test("ArrowRight focuses the first cell, which keeps a tabindex only while it holds focus", () => {
    open("findings");
    const row = document.querySelector<HTMLElement>('[role="row"][data-pkg][tabindex="0"]');
    if (row === null) throw new Error("no Tab stop row");
    row.focus();
    const first = row.querySelector<HTMLElement>('[role="gridcell"]');

    press("ArrowRight");
    expect(document.activeElement).toBe(first);
    expect(first?.getAttribute("tabindex")).toBe("-1");
    press("ArrowLeft");

    expect(document.activeElement).toBe(row);
    expect(first?.hasAttribute("tabindex")).toBe(false);
  });

  test("a cell keeps its tabindex through a blur that leaves it focused, as a window switch does", () => {
    open("findings");
    const row = document.querySelector<HTMLElement>('[role="row"][data-pkg][tabindex="0"]');
    row?.focus();
    press("ArrowRight");
    const cell = document.activeElement;

    cell?.dispatchEvent(new FocusEvent("blur"));

    expect(document.activeElement).toBe(cell);
    expect(cell?.getAttribute("tabindex")).toBe("-1");
  });

  test("leaves ArrowRight with a modifier to the browser", () => {
    open("findings");
    const row = document.querySelector<HTMLElement>('[role="row"][data-pkg][tabindex="0"]');
    row?.focus();

    fireEvent.keyDown(row ?? document.body, { key: "ArrowRight", altKey: true });

    expect(document.activeElement).toBe(row);
  });
});

describe("on a Blast radius row", () => {
  test("ArrowRight unfolds a folded row and ArrowLeft folds it", () => {
    open("radius");
    const row = document.querySelector<HTMLElement>('[role="treeitem"][aria-expanded="false"]');
    if (row === null) throw new Error("no folded row");
    const pkg = row.dataset.pkg ?? "";
    row.focus();
    const same = (): Element | null =>
      [...document.querySelectorAll('[role="treeitem"][aria-expanded]')].find(
        (item) => item.getAttribute("data-pkg") === pkg,
      ) ?? null;

    press("ArrowRight");
    expect(same()?.getAttribute("aria-expanded")).toBe("true");
    press("ArrowLeft");

    expect(same()?.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("on an Advisories package with two rows", () => {
  test("Escape after Enter on a cell gives focus back to the row the reader acted on", () => {
    open("advisories");
    const rows = [...document.querySelectorAll<HTMLElement>('[role="row"][data-pkg="twig/twig"]')];
    const [first, second] = rows;
    if (first === undefined || second === undefined) throw new Error("twig/twig has two advisory rows");
    second.focus();
    fireEvent.click(second);
    press("Escape");
    first.focus();
    press("ArrowRight");

    press("Enter");
    press("Escape");

    expect(document.activeElement).toBe(first);
  });
});
