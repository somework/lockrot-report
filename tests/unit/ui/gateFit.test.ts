import { afterEach, describe, expect, it } from "vitest";
import { fitGateMarks, type GateFit } from "../../../src/ui/views/gateFit";

const ROW_HEIGHT = 20;
const MARK_WIDTH = 30;

interface Layout {
  /** The places where a row's words add a line to it, by package. */
  readonly grows?: Readonly<Record<string, readonly string[]>>;
  /** The places where a row's words rewrap it a pixel shorter, by package. */
  readonly shrinks?: Readonly<Record<string, readonly string[]>>;
  /** The places where a row's words add a line unless another row's words there widen the column. */
  readonly growsAlone?: Readonly<Record<string, readonly string[]>>;
  /** The places whose words widen a table column, so the whole list grows. */
  readonly widens?: readonly string[];
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

/** A list of marked rows whose boxes answer as the layout says, for the words' current places. */
function list(pkgs: readonly string[], spots: readonly string[], layout: Layout): HTMLElement {
  const root = document.createElement("div");
  const rows = pkgs.map((pkg, i) => {
    const row = document.createElement("div");
    row.className = "row has-gate";
    row.dataset["pkg"] = pkg;
    row.getBoundingClientRect = () => {
      const at = row.dataset["gateAt"] ?? "none";
      const alone = !rows.some((other) => other !== row && other.dataset["gateAt"] === at);
      const grown =
        layout.grows?.[pkg]?.includes(at) === true ||
        (alone && layout.growsAlone?.[pkg]?.includes(at) === true);
      const shrunk = layout.shrinks?.[pkg]?.includes(at) === true;
      return rect(0, i * ROW_HEIGHT, 400, grown ? ROW_HEIGHT * 2 : shrunk ? ROW_HEIGHT - 1 : ROW_HEIGHT);
    };
    for (const spot of spots) {
      const mark = document.createElement("span");
      mark.className = `gate-mark gate-at-${spot}`;
      mark.getBoundingClientRect = () =>
        row.dataset["gateAt"] === spot ? rect(10, i * ROW_HEIGHT, MARK_WIDTH, 14) : rect(0, 0, 0, 0);
      row.append(mark);
    }
    root.append(row);
    return row;
  });
  root.getBoundingClientRect = () => {
    const widened = rows.some((row) => layout.widens?.includes(row.dataset["gateAt"] ?? "none") === true);
    const own = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    return rect(0, 0, 400, own + (widened ? ROW_HEIGHT : 0));
  };
  document.body.append(root);
  return root;
}

function places(root: HTMLElement): Record<string, string> {
  const entries = [...root.querySelectorAll<HTMLElement>(".row")].map((row): [string, string] => [
    row.dataset["pkg"] ?? "",
    row.dataset["gateAt"] ?? "",
  ]);
  return Object.fromEntries(entries);
}

const TABLE: GateFit = { rows: ".row.has-gate", order: () => ["reach", "name"], table: true };
const LIST: GateFit = { rows: ".row.has-gate", order: () => ["reach", "name"] };

afterEach(() => {
  document.body.replaceChildren();
});

describe("fitGateMarks", () => {
  it("puts each row's words in the first place that keeps its height", () => {
    const root = list(["a/one", "a/two"], ["reach", "name"], { grows: { "a/two": ["reach"] } });
    fitGateMarks(root, LIST);
    expect(places(root)).toEqual({ "a/one": "reach", "a/two": "name" });
  });

  it("a place that makes the row shorter does not keep its height either", () => {
    const root = list(["a/one"], ["reach", "name"], { shrinks: { "a/one": ["reach"] } });
    fitGateMarks(root, LIST);
    expect(places(root)).toEqual({ "a/one": "name" });
  });

  it("tries a place without its separator before the next place", () => {
    const root = list(["a/one"], ["reach", "name"], {});
    const row = root.querySelector<HTMLElement>(".row");
    if (row === null) throw new Error("no row");
    const loose = row.getBoundingClientRect.bind(row);
    row.getBoundingClientRect = () => {
      const box = loose();
      const tight = row.hasAttribute("data-gate-tight");
      return row.dataset["gateAt"] === "reach" && !tight ? rect(0, 0, 400, ROW_HEIGHT * 2) : box;
    };
    fitGateMarks(root, LIST);
    expect(places(root)).toEqual({ "a/one": "reach" });
    expect(row.hasAttribute("data-gate-tight")).toBe(true);
  });

  it("a row with room nowhere shows no words", () => {
    const root = list(["a/one"], ["reach", "name"], { grows: { "a/one": ["reach", "name"] } });
    fitGateMarks(root, LIST);
    expect(places(root)).toEqual({ "a/one": "none" });
  });

  it("when a table column's words grow the table, the whole column moves on together", () => {
    const pkgs = ["a/one", "a/two", "a/three"];
    const root = list(pkgs, ["reach", "name"], { widens: ["reach"] });
    fitGateMarks(root, TABLE);
    expect(places(root)).toEqual({ "a/one": "name", "a/two": "name", "a/three": "name" });
  });

  it("a row that has no room in the next place either shows none, and the rest keep theirs", () => {
    const root = list(["a/one", "a/two"], ["reach", "name"], {
      widens: ["reach"],
      grows: { "a/two": ["name"] },
    });
    fitGateMarks(root, TABLE);
    expect(places(root)).toEqual({ "a/one": "name", "a/two": "none" });
  });

  it("a row with no room until a moved column widened the next place takes it then", () => {
    const root = list(["a/one", "a/two"], ["reach", "name"], {
      widens: ["reach"],
      grows: { "a/two": ["reach"] },
      growsAlone: { "a/two": ["name"] },
    });
    fitGateMarks(root, TABLE);
    expect(places(root)).toEqual({ "a/one": "name", "a/two": "name" });
  });

  it("when every place grows the table, no row shows words and the table keeps its height", () => {
    const root = list(["a/one", "a/two"], ["reach", "name"], { widens: ["reach", "name"] });
    fitGateMarks(root, TABLE);
    expect(places(root)).toEqual({ "a/one": "none", "a/two": "none" });
    expect(root.getBoundingClientRect().height).toBe(ROW_HEIGHT * 2);
  });

  it("a list that is not a table keeps its places whatever its height", () => {
    const root = list(["a/one", "a/two"], ["reach", "name"], { widens: ["reach"] });
    fitGateMarks(root, LIST);
    expect(places(root)).toEqual({ "a/one": "reach", "a/two": "reach" });
  });

  it("a list with no marked row is left alone", () => {
    const root = document.createElement("div");
    const row = document.createElement("div");
    row.className = "row";
    root.append(row);
    fitGateMarks(root, TABLE);
    expect(row.dataset["gateAt"]).toBeUndefined();
  });
});
