import { describe, expect, test } from "vitest";

import { sideStep } from "../../../src/ui/sideKeys";

const parse = (html: string): HTMLElement => new DOMParser().parseFromString(html, "text/html").body;

const grid = (): HTMLElement =>
  parse(`<div role="treegrid"><div role="row" data-pkg="a/a" tabindex="0">
      <span role="gridcell">1</span><span role="gridcell"><a href="#x">link</a></span><span role="gridcell"></span><span role="gridcell" aria-label="3 years"></span>
    </div></div>`);

const tree = (expanded: boolean): HTMLElement =>
  parse(`<ul role="tree"><li role="treeitem" data-pkg="r/r" aria-expanded="${String(expanded)}" tabindex="0">
      <div><button type="button" aria-expanded="${String(expanded)}">t</button></div>
      <ul role="group"><li role="treeitem" data-pkg="k/k" aria-level="2" tabindex="-1">kid</li><li role="treeitem" data-pkg="g/g" aria-level="3" tabindex="-1">grandkid</li></ul>
    </li><li role="treeitem" data-pkg="s/s" tabindex="-1">single</li></ul>`);

const at = (root: HTMLElement, selector: string): HTMLElement =>
  root.querySelector<HTMLElement>(selector) ?? (null as never);

describe("sideStep in a treegrid row", () => {
  test("ArrowRight from the row goes to its first cell, then to the next", () => {
    const root = grid();
    const cells = root.querySelectorAll<HTMLElement>('[role="gridcell"]');

    expect(sideStep("ArrowRight", at(root, '[role="row"]'))).toEqual({ focus: cells[0] });
    expect(sideStep("ArrowRight", cells[0] ?? null)).toEqual({ focus: cells[1] });
  });

  test("ArrowRight on the last cell stays, ArrowLeft goes back past an empty cell and from the first cell to the row", () => {
    const root = grid();
    const cells = root.querySelectorAll<HTMLElement>('[role="gridcell"]');

    expect(sideStep("ArrowRight", cells[3] ?? null)).toEqual({ stay: true });
    expect(sideStep("ArrowLeft", cells[3] ?? null)).toEqual({ focus: cells[1] });
    expect(sideStep("ArrowLeft", cells[0] ?? null)).toEqual({ focus: at(root, '[role="row"]') });
    expect(sideStep("ArrowLeft", at(root, '[role="row"]'))).toEqual({ stay: true });
  });

  test("walks on from a link inside a cell, as from the cell", () => {
    const root = grid();
    const cells = root.querySelectorAll<HTMLElement>('[role="gridcell"]');

    expect(sideStep("ArrowRight", at(root, "a"))).toEqual({ focus: cells[3] });
  });

  test("leaves any other key, and an element outside a treegrid row, to the page", () => {
    const root = grid();

    expect(sideStep("ArrowDown", at(root, '[role="row"]'))).toBeNull();
    expect(sideStep("ArrowRight", root)).toBeNull();
  });
});

describe("sideStep in a tree", () => {
  test("ArrowRight unfolds a folded item, then goes to its first child", () => {
    const folded = tree(false);
    expect(sideStep("ArrowRight", at(folded, '[data-pkg="r/r"]'))).toEqual({ toggle: at(folded, "button") });
    const open = tree(true);
    expect(sideStep("ArrowRight", at(open, '[data-pkg="r/r"]'))).toEqual({
      focus: at(open, '[data-pkg="k/k"]'),
    });
  });

  test("ArrowLeft folds an unfolded item, and from a child goes to its parent", () => {
    const open = tree(true);

    expect(sideStep("ArrowLeft", at(open, '[data-pkg="r/r"]'))).toEqual({ toggle: at(open, "button") });
    expect(sideStep("ArrowLeft", at(open, '[data-pkg="k/k"]'))).toEqual({
      focus: at(open, '[data-pkg="r/r"]'),
    });
  });

  test("ArrowLeft from an item drawn under another listed item goes to that item", () => {
    const open = tree(true);

    expect(sideStep("ArrowLeft", at(open, '[data-pkg="g/g"]'))).toEqual({
      focus: at(open, '[data-pkg="k/k"]'),
    });
  });

  test("an item with nothing under it keeps focus on both keys", () => {
    const root = tree(false);

    expect(sideStep("ArrowRight", at(root, '[data-pkg="s/s"]'))).toEqual({ stay: true });
    expect(sideStep("ArrowLeft", at(root, '[data-pkg="s/s"]'))).toEqual({ stay: true });
  });
});
