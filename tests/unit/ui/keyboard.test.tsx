import { describe, expect, test } from "vitest";
import {
  decideKey,
  findRow,
  keyInputFrom,
  prevents,
  rowAt,
  rowPosition,
  type KeyInput,
} from "../../../src/ui/keyboard";

const ROWS = ["a/one", "a/two", "a/three"];

function input(overrides: Partial<KeyInput>): KeyInput {
  return {
    key: "j",
    modified: false,
    typing: false,
    searchFocused: false,
    dialogOpen: false,
    popoverOpen: false,
    rowPkg: null,
    rowIndex: null,
    onControl: false,
    selected: null,
    rendered: ROWS,
    sheetOpen: false,
    searchAvailable: true,
    ...overrides,
  };
}

describe("j / k walk the rendered rows", () => {
  test("from nothing open, both j and k land on the first row", () => {
    expect(decideKey(input({ key: "j" }))).toEqual({ type: "move", pkg: "a/one", index: 0 });
    expect(decideKey(input({ key: "k" }))).toEqual({ type: "move", pkg: "a/one", index: 0 });
  });

  test("move one row from the open package", () => {
    expect(decideKey(input({ key: "j", selected: "a/two" }))).toEqual({
      type: "move",
      pkg: "a/three",
      index: 2,
    });
    expect(decideKey(input({ key: "k", selected: "a/two" }))).toEqual({
      type: "move",
      pkg: "a/one",
      index: 0,
    });
  });

  test("clamp at both ends instead of wrapping", () => {
    expect(decideKey(input({ key: "j", selected: "a/three" }))).toEqual({
      type: "move",
      pkg: "a/three",
      index: 2,
    });
    expect(decideKey(input({ key: "k", selected: "a/one" }))).toEqual({
      type: "move",
      pkg: "a/one",
      index: 0,
    });
  });

  test("an open package with no row on screen restarts from the first row (M7)", () => {
    expect(decideKey(input({ key: "j", selected: "elsewhere/pkg" }))).toEqual({
      type: "move",
      pkg: "a/one",
      index: 0,
    });
  });

  // PD-ROWS-11: after Escape handed focus back to a row, `j` restarted at the top of the list.
  test("move from the focused row when nothing is open", () => {
    expect(decideKey(input({ key: "j", rowPkg: "a/two" }))).toEqual({
      type: "move",
      pkg: "a/three",
      index: 2,
    });
    expect(decideKey(input({ key: "k", rowPkg: "a/two" }))).toEqual({ type: "move", pkg: "a/one", index: 0 });
  });

  test("move from the focused row, not the open package, when the two differ", () => {
    expect(decideKey(input({ key: "j", rowPkg: "a/one", selected: "a/three" }))).toEqual({
      type: "move",
      pkg: "a/two",
      index: 1,
    });
  });

  test("ignore a focused element whose package the view does not list", () => {
    expect(decideKey(input({ key: "j", rowPkg: "elsewhere/pkg", selected: "a/one" }))).toEqual({
      type: "move",
      pkg: "a/two",
      index: 1,
    });
  });

  // PD-ROWS-12: Advisories lists a package once per advisory. `j` from its second row used to find
  // the package's first row by name and step from there, so it could never walk past the second.
  test("a package listed twice is walked row by row, by position", () => {
    const rendered = ["a/one", "a/two", "a/three", "a/two", "a/four"];
    expect(decideKey(input({ key: "j", rendered, rowPkg: "a/two", rowIndex: 3, selected: "a/two" }))).toEqual(
      {
        type: "move",
        pkg: "a/four",
        index: 4,
      },
    );
    expect(
      decideKey(input({ key: "j", rendered, rowPkg: "a/three", rowIndex: 2, selected: "a/three" })),
    ).toEqual({ type: "move", pkg: "a/two", index: 3 });
    // A position that no longer shows the focused package falls back to its first row.
    expect(decideKey(input({ key: "j", rendered, rowPkg: "a/two", rowIndex: 0 }))).toEqual({
      type: "move",
      pkg: "a/three",
      index: 2,
    });
  });

  test("do nothing when the view has no rows", () => {
    expect(decideKey(input({ key: "j", rendered: [] }))).toEqual({ type: "ignore" });
  });

  test("are ignored while typing, while a dialog is open (M10), and with a modifier held", () => {
    expect(decideKey(input({ typing: true, searchFocused: true }))).toEqual({ type: "ignore" });
    expect(decideKey(input({ dialogOpen: true }))).toEqual({ type: "ignore" });
    expect(decideKey(input({ modified: true }))).toEqual({ type: "ignore" });
  });
});

describe("/ and ?", () => {
  test("/ focuses the search box, ? opens the glossary", () => {
    expect(decideKey(input({ key: "/" }))).toEqual({ type: "focusSearch", closeDetail: false });
    expect(decideKey(input({ key: "?" }))).toEqual({ type: "openGlossary" });
  });

  test("are text while typing", () => {
    expect(decideKey(input({ key: "/", typing: true, searchFocused: true }))).toEqual({ type: "ignore" });
    expect(decideKey(input({ key: "?", typing: true, searchFocused: true }))).toEqual({ type: "ignore" });
  });

  // PD-ROWS-12: the search box sits under a detail sheet, so focus would land on a field nobody sees.
  test("/ closes a sheet over the page on its way to the search box", () => {
    expect(decideKey(input({ key: "/", sheetOpen: true, selected: "a/one" }))).toEqual({
      type: "focusSearch",
      closeDetail: true,
    });
    // A detail beside the list leaves the box in sight: it stays open.
    expect(decideKey(input({ key: "/", selected: "a/one" }))).toEqual({
      type: "focusSearch",
      closeDetail: false,
    });
    // A tab without a search box: nothing to go to, so the sheet stays.
    expect(decideKey(input({ key: "/", sheetOpen: true, searchAvailable: false }))).toEqual({
      type: "ignore",
    });
  });

  test("? does not reopen an open glossary", () => {
    expect(decideKey(input({ key: "?", dialogOpen: true }))).toEqual({ type: "ignore" });
  });
});

describe("Escape closes the topmost thing, one per press", () => {
  test("the glossary first, even over an open detail", () => {
    expect(decideKey(input({ key: "Escape", dialogOpen: true, selected: "a/one" }))).toEqual({
      type: "closeGlossary",
    });
  });

  test("then the detail, naming the row to give focus back to", () => {
    expect(decideKey(input({ key: "Escape", selected: "a/two", searchFocused: true }))).toEqual({
      type: "closeDetail",
      restore: "a/two",
    });
  });

  // PD-ROWS-11: Escape typed in the search box used to pull focus out of it onto the closed row.
  test("the detail from inside the search box, leaving focus in the box", () => {
    expect(decideKey(input({ key: "Escape", selected: "a/two", searchFocused: true, typing: true }))).toEqual(
      { type: "closeDetail", restore: null },
    );
  });

  test("then the search box's focus, keeping the browser's own Escape", () => {
    const decision = decideKey(input({ key: "Escape", searchFocused: true, typing: true }));
    expect(decision).toEqual({ type: "blurSearch" });
    expect(prevents(decision)).toBe(false);
  });

  test("and nothing when nothing is open", () => {
    expect(decideKey(input({ key: "Escape" }))).toEqual({ type: "ignore" });
  });

  test("a native popover (the gate fact, PD-SUMMARY-4), over an open detail: the browser's own Escape handling closes the popover, not the detail", () => {
    // The popover closes as event's default action, which only fires when nothing here calls
    // event.preventDefault() — decideKey has to return "ignore" (prevents() === false), not
    // "closeDetail", or the same Escape press would close both at once.
    const decision = decideKey(input({ key: "Escape", popoverOpen: true, selected: "a/two" }));
    expect(decision).toEqual({ type: "ignore" });
    expect(prevents(decision)).toBe(false);
  });

  test("a pill's popover first, even over the glossary and an open detail (PD-GLOSSARY-6)", () => {
    // The browser closes the popover itself; the page's own decision is to do nothing so it
    // does not also close the glossary or the detail underneath it on the same press.
    const decision = decideKey(
      input({ key: "Escape", popoverOpen: true, dialogOpen: true, selected: "a/two" }),
    );
    expect(decision).toEqual({ type: "ignore" });
    expect(prevents(decision)).toBe(false);
  });
});

describe("Enter and Space on a row", () => {
  test("open the row's package", () => {
    expect(decideKey(input({ key: "Enter", rowPkg: "a/two" }))).toEqual({ type: "openRow", pkg: "a/two" });
    expect(decideKey(input({ key: " ", rowPkg: "a/two", selected: "a/one" }))).toEqual({
      type: "openRow",
      pkg: "a/two",
    });
  });

  test("leave the open package open when its own row is pressed again (PD-ROWS-7)", () => {
    expect(decideKey(input({ key: "Enter", rowPkg: "a/two", selected: "a/two" }))).toEqual({
      type: "openRow",
      pkg: "a/two",
    });
  });

  test("leave a link or control inside the row to do its own thing (M5)", () => {
    expect(decideKey(input({ key: "Enter", rowPkg: "a/two", onControl: true }))).toEqual({ type: "ignore" });
  });

  test("do nothing outside a row", () => {
    expect(decideKey(input({ key: "Enter" }))).toEqual({ type: "ignore" });
  });

  test("the page's own actions cancel the browser's default", () => {
    expect(prevents({ type: "openRow", pkg: "a/one" })).toBe(true);
    expect(prevents({ type: "ignore" })).toBe(false);
  });
});

describe("keyInputFrom reads the page around a key", () => {
  function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, ...init });
    target.dispatchEvent(event);

    return event;
  }

  test("a row, a link inside it, and the lazily computed rendered order", () => {
    document.body.replaceChildren();
    const row = document.createElement("div");
    row.setAttribute("data-pkg", "a/two");
    row.tabIndex = 0;
    const link = document.createElement("a");
    link.href = "https://packagist.org/";
    row.append(link);
    document.body.append(row);
    let computed = 0;
    const context = {
      search: null,
      dialogOpen: false,
      selected: null,
      sheetOpen: false,
      rendered: () => {
        computed += 1;
        return ROWS;
      },
    };

    const onRow = keyInputFrom(press(row, "Enter"), context);
    expect(onRow).toMatchObject({ rowPkg: "a/two", onControl: false, typing: false, rendered: [] });
    expect(computed).toBe(0);

    expect(keyInputFrom(press(link, "Enter"), context)).toMatchObject({ rowPkg: "a/two", onControl: true });
    expect(keyInputFrom(press(row, "j", { ctrlKey: true }), context)).toMatchObject({
      modified: true,
      rendered: ROWS,
      rowIndex: 0,
    });
    expect(computed).toBe(1);
  });

  test("the row's position, the sheet and the search box's presence", () => {
    document.body.replaceChildren();
    const rows = ["a/one", "a/two", "a/one"].map((name) => {
      const node = document.createElement("div");
      node.setAttribute("data-pkg", name);
      node.tabIndex = -1;
      document.body.append(node);
      return node;
    });
    const second = rows[2];
    if (second === undefined) throw new Error("three rows");
    const context = {
      search: null,
      dialogOpen: false,
      selected: "a/one",
      sheetOpen: true,
      rendered: () => ROWS,
    };

    expect(keyInputFrom(press(second, "j"), context)).toMatchObject({
      rowPkg: "a/one",
      rowIndex: 2,
      sheetOpen: true,
      searchAvailable: false,
    });
    // Read for j/k only.
    expect(keyInputFrom(press(second, "Enter"), context)).toMatchObject({ rowIndex: null });
  });

  test("popoverOpen is read from the DOM only for Escape, and never throws without Popover API support", () => {
    // happy-dom (this suite's DOM, vitest.config.ts) does not implement the Popover API at all, so
    // this also stands in for the "engine does not know :popover-open" guard — the real assertion
    // is that neither call throws and both read as false.
    document.body.replaceChildren();
    const row = document.createElement("div");
    row.setAttribute("data-pkg", "a/one");
    document.body.append(row);
    const context = {
      search: null,
      dialogOpen: false,
      selected: null,
      sheetOpen: false,
      rendered: () => ROWS,
    };

    expect(keyInputFrom(press(row, "Escape"), context)).toMatchObject({ popoverOpen: false });
    // Not Escape: never even checked, so a key that is not Escape carries popoverOpen: false too.
    expect(keyInputFrom(press(row, "j"), context)).toMatchObject({ popoverOpen: false });
  });

  test("the search box counts as typing and as the search", () => {
    document.body.replaceChildren();
    const search = document.createElement("input");
    search.type = "search";
    document.body.append(search);
    search.focus();
    const read = keyInputFrom(press(search, "j"), {
      search,
      dialogOpen: false,
      selected: null,
      sheetOpen: false,
      rendered: () => ROWS,
    });
    expect(read).toMatchObject({ typing: true, searchFocused: true });
  });
});

describe("findRow compares names, never builds a selector", () => {
  test("finds names full of selector metacharacters", () => {
    document.body.replaceChildren();
    const names = ['we"ird\\name[0]', "a/one", "a/one"];
    for (const name of names) {
      const node = document.createElement("div");
      node.setAttribute("data-pkg", name);
      document.body.append(node);
    }
    expect(findRow(document, 'we"ird\\name[0]')?.getAttribute("data-pkg")).toBe('we"ird\\name[0]');
    expect(findRow(document, "a/one")).toBe(document.body.children[1]);
    expect(findRow(document, "missing")).toBeNull();
  });
});

describe("rowAt and rowPosition tell a package's rows apart (PD-ROWS-12)", () => {
  test("the row at a position when it still shows the package, else the package's first row", () => {
    document.body.replaceChildren();
    for (const name of ["a/one", "a/two", "a/one"]) {
      const node = document.createElement("div");
      node.setAttribute("data-pkg", name);
      document.body.append(node);
    }
    const [first, , second] = Array.from(document.body.children);
    expect(rowAt(document, "a/one", 2)).toBe(second);
    expect(rowAt(document, "a/one", 1)).toBe(first);
    expect(rowAt(document, "a/one", null)).toBe(first);
    expect(rowAt(document, "a/one", 9)).toBe(first);
    expect(rowAt(document, "missing", 0)).toBeNull();
    expect(second === undefined ? null : rowPosition(document, second)).toBe(2);
    expect(rowPosition(document, document.body)).toBeNull();
  });
});
