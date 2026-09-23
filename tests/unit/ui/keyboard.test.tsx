import { describe, expect, test } from "vitest";
import { decideKey, findRow, keyInputFrom, prevents, type KeyInput } from "../../../src/ui/keyboard";

const ROWS = ["a/one", "a/two", "a/three"];

function input(overrides: Partial<KeyInput>): KeyInput {
  return {
    key: "j",
    modified: false,
    typing: false,
    searchFocused: false,
    dialogOpen: false,
    rowPkg: null,
    onControl: false,
    selected: null,
    rendered: ROWS,
    ...overrides,
  };
}

describe("j / k walk the rendered rows", () => {
  test("from nothing open, both j and k land on the first row", () => {
    expect(decideKey(input({ key: "j" }))).toEqual({ type: "move", pkg: "a/one" });
    expect(decideKey(input({ key: "k" }))).toEqual({ type: "move", pkg: "a/one" });
  });

  test("move one row from the open package", () => {
    expect(decideKey(input({ key: "j", selected: "a/two" }))).toEqual({ type: "move", pkg: "a/three" });
    expect(decideKey(input({ key: "k", selected: "a/two" }))).toEqual({ type: "move", pkg: "a/one" });
  });

  test("clamp at both ends instead of wrapping", () => {
    expect(decideKey(input({ key: "j", selected: "a/three" }))).toEqual({ type: "move", pkg: "a/three" });
    expect(decideKey(input({ key: "k", selected: "a/one" }))).toEqual({ type: "move", pkg: "a/one" });
  });

  test("an open package with no row on screen restarts from the first row (M7)", () => {
    expect(decideKey(input({ key: "j", selected: "elsewhere/pkg" }))).toEqual({ type: "move", pkg: "a/one" });
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
    expect(decideKey(input({ key: "/" }))).toEqual({ type: "focusSearch" });
    expect(decideKey(input({ key: "?" }))).toEqual({ type: "openGlossary" });
  });

  test("are text while typing", () => {
    expect(decideKey(input({ key: "/", typing: true, searchFocused: true }))).toEqual({ type: "ignore" });
    expect(decideKey(input({ key: "?", typing: true, searchFocused: true }))).toEqual({ type: "ignore" });
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

  test("then the search box's focus, keeping the browser's own Escape", () => {
    const decision = decideKey(input({ key: "Escape", searchFocused: true, typing: true }));
    expect(decision).toEqual({ type: "blurSearch" });
    expect(prevents(decision)).toBe(false);
  });

  test("and nothing when nothing is open", () => {
    expect(decideKey(input({ key: "Escape" }))).toEqual({ type: "ignore" });
  });
});

describe("Enter and Space on a row", () => {
  test("open the row's package, or close it when it is the open one", () => {
    expect(decideKey(input({ key: "Enter", rowPkg: "a/two" }))).toEqual({ type: "toggleRow", pkg: "a/two" });
    expect(decideKey(input({ key: " ", rowPkg: "a/two", selected: "a/two" }))).toEqual({
      type: "toggleRow",
      pkg: null,
    });
  });

  test("leave a link or control inside the row to do its own thing (M5)", () => {
    expect(decideKey(input({ key: "Enter", rowPkg: "a/two", onControl: true }))).toEqual({ type: "ignore" });
  });

  test("do nothing outside a row", () => {
    expect(decideKey(input({ key: "Enter" }))).toEqual({ type: "ignore" });
  });

  test("the page's own actions cancel the browser's default", () => {
    expect(prevents({ type: "toggleRow", pkg: "a/one" })).toBe(true);
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
    });
    expect(computed).toBe(1);
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
