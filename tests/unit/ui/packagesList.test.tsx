// PD-PACKAGES-1/2, PD-RAIL-4, PD-PROSE-1 (DESIGN.md §5): the All packages list's answer, marks and
// dots; the active-filters line; a package named in a sentence opening it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRef, type ComponentChild } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type Action, type State } from "../../../src/state/types";
import { ReportContext, type ReportContextValue } from "../../../src/ui/context";
import { PackagesView } from "../../../src/ui/views/PackagesView";
import { ActiveFilters } from "../../../src/ui/search/ActiveFilters";
import { MentionProse, PkgMention } from "../../../src/ui/common/PkgMention";
import { renderedPackages } from "../../../src/ui/views/order";
import { pickCursor } from "../../../src/ui/rowCursor";
import { makeFinding, makeModel, makeSignal } from "../domain/fixtures";

afterEach(cleanup);

function loadModel(name: string): Model {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "bundles", name), "utf8")) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name} failed to normalize`);
  return result.model;
}

function renderIn(model: Model, state: State, ui: ComponentChild) {
  const dispatch = vi.fn<(action: Action) => void>();
  const value: ReportContextValue = {
    model,
    state,
    dispatch,
    now: new Date(model.report.generatedAt),
    wide: true,
    cursor: pickCursor(renderedPackages(model, state, state.view), state.pkg, null),
    openGlossary: vi.fn(),
    openGlossaryFrom: vi.fn(),
  };
  return { ...render(<ReportContext.Provider value={value}>{ui}</ReportContext.Provider>), dispatch };
}

const packages = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE,
  view: "packages",
  ...overrides,
});

describe("PackagesView (PD-PACKAGES-1): libyears as a scale, its marks keyed once", () => {
  const model = makeModel([
    makeFinding({ package: "a/behind", libyears: 2.5 }),
    makeFinding({ package: "b/newest", libyears: 0 }),
    makeFinding({ package: "c/unmeasured", libyears: null, version: "dev-main" }),
  ]);

  it("answers how many listed packages are behind, not behind, and unmeasured", () => {
    const { container } = renderIn(model, packages(), <PackagesView />);
    expect(container.querySelector(".pk-answer")?.textContent).toBe(
      "1 package of the 3 listed is behind its newest stable release; 1 is not, and 1 could not be measured.",
    );
    expect(container.querySelector(".pk-key")?.textContent).toContain("not behind its newest stable");
    expect(container.querySelector(".pk-key")?.textContent).toContain("not measured");
  });

  it("draws a zero as a dash and an unmeasured value as a question mark, each keeping its reason in words", () => {
    renderIn(model, packages(), <PackagesView />);
    const zero = screen.getByRole("row", { name: "b/newest" }).querySelector(".pk-ly");
    expect(zero?.querySelector("[aria-hidden]")?.textContent).toBe("—");
    expect(zero?.querySelector(".vh")?.textContent).toBe("0.0, the installed release is the newest");
    const none = screen.getByRole("row", { name: "c/unmeasured" }).querySelector(".pk-ly");
    expect(none?.querySelector("[aria-hidden]")?.textContent).toBe("?");
    expect(none?.querySelector(".vh")?.textContent).toBe("not measured: branch snapshot");
  });

  it("draws a value above zero as a bar on the population's scale, captioned in the head", () => {
    renderIn(model, packages(), <PackagesView />);
    const bar = screen.getByRole("row", { name: "a/behind" }).querySelector<HTMLElement>(".ly-bar");
    // 2.5 of a 3-year scale.
    expect(bar?.style.width).toBe(`${(2.5 / 3) * 100}%`);
    const head = screen.getByRole("columnheader", { name: /libyears/i });
    expect(head.querySelector(".ly-axis")?.textContent).toBe("03y");
  });
});

describe("PackagesView (PD-PACKAGES-2): signals as ten dots", () => {
  it("fills the fired ids' dots in their level's tone and names the ids in words", () => {
    const model = makeModel([
      makeFinding({
        package: "a/b",
        signals: [makeSignal({ id: "S1", level: "high" }), makeSignal({ id: "S4", level: "warn" })],
      }),
    ]);
    renderIn(model, packages(), <PackagesView />);
    const cell = screen.getByRole("row", { name: "a/b" }).querySelector(".pk-sig");
    const dots = Array.from(cell?.querySelectorAll(".sig-dot") ?? []);
    expect(dots).toHaveLength(10);
    expect(dots[0]?.className).toContain("is-fired tone-crit");
    expect(dots[3]?.className).toContain("is-fired tone-med");
    expect(dots[1]?.className).toContain("is-quiet");
    expect(cell?.querySelector(".vh")?.textContent).toBe("S1 S4");
  });
});

describe("ActiveFilters (PD-RAIL-4)", () => {
  const model = loadModel("wallabag_wallabag.json");

  it("lists nothing when nothing narrows the list", () => {
    const { container } = renderIn(model, INITIAL_STATE, <ActiveFilters inputRef={createRef()} />);
    expect(container.textContent).toBe("");
  });

  it("lists each selection and the search, each removing only itself", () => {
    const state: State = {
      ...INITIAL_STATE,
      q: " symfony ",
      filters: { ...EMPTY_FILTERS, scope: ["direct"], prio: ["high"] },
    };
    const { dispatch } = renderIn(model, state, <ActiveFilters inputRef={createRef()} />);
    const list = screen.getByRole("group", { name: "Filtered by" });
    const chips = within(list).getAllByRole("button");
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Remove filter: Priority high",
      "Remove filter: Scope Direct",
      "Remove filter: Search “symfony”",
    ]);

    fireEvent.click(chips[1] as HTMLElement);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "toggle", group: "scope", key: "direct" });
    fireEvent.click(chips[2] as HTMLElement);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "query", q: "" });
  });
});

describe("PkgMention and MentionProse (PD-PROSE-1)", () => {
  const model = loadModel("mini.json");

  it("opens a package the lock lists, and leaves any other name as words", () => {
    const { dispatch } = renderIn(
      model,
      INITIAL_STATE,
      <p>
        <PkgMention name="vendor/direct" /> and <PkgMention name="not/in-lock" />
      </p>,
    );
    fireEvent.click(screen.getByRole("button", { name: "vendor/direct" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "select", pkg: "vendor/direct" });
    expect(screen.queryByRole("button", { name: "not/in-lock" })).toBeNull();
  });

  it("never links the package that is already open", () => {
    renderIn(model, { ...INITIAL_STATE, pkg: "vendor/direct" }, <PkgMention name="vendor/direct" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("finds lock names inside a sentence, keeping their punctuation outside the link", () => {
    const { container } = renderIn(
      model,
      INITIAL_STATE,
      <p>
        <MentionProse text="It comes through vendor/direct, and (vendor/transitive)." />
      </p>,
    );
    expect(container.textContent).toBe("It comes through vendor/direct, and (vendor/transitive).");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "vendor/direct",
      "vendor/transitive",
    ]);
  });
});
