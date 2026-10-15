// PD-PACKAGES-5 (DESIGN.md §5): the All packages wrap as a keyboard region. PD-RAIL-4: the
// active-filters line.
import { createRef } from "preact";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type Action, type State } from "../../../src/state/types";
import { App } from "../../../src/ui/App";
import { ReportContext } from "../../../src/ui/context";
import { ActiveFilters } from "../../../src/ui/search/ActiveFilters";

afterEach(cleanup);

function composite(): Model {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

describe("PackagesView2 (PD-PACKAGES-5): the wrap is a keyboard region only while it scrolls", () => {
  let observed: (() => void)[] = [];

  beforeEach(() => {
    observed = [];
    window.matchMedia = ((query: string) => ({
      matches: query.includes("1181"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    history.replaceState(null, "", "/report.html#view=packages");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sized(scroll: number, client: number): void {
    const wrap = document.querySelector<HTMLElement>(".tablewrap");
    if (wrap === null) throw new Error("no wrap");
    Object.defineProperty(wrap, "scrollWidth", { configurable: true, value: scroll });
    Object.defineProperty(wrap, "clientWidth", { configurable: true, value: client });
    // A synchronous callback: `act` flushes the state it sets before returning.
    void act(() => {
      observed.forEach((callback) => {
        callback();
      });
    });
  }

  it("is a plain box while the table fits", () => {
    render(<App model={composite()} />);
    sized(600, 600);

    const wrap = document.querySelector(".tablewrap");
    expect(wrap?.hasAttribute("tabindex")).toBe(false);
    expect(wrap?.hasAttribute("role")).toBe(false);
  });

  it("becomes a named, focusable region while the table is wider than it, and stops when it fits again", () => {
    render(<App model={composite()} />);

    sized(1019, 506);
    const region = screen.getByRole("region", { name: "All packages table, scrolls sideways" });
    expect(region.getAttribute("tabindex")).toBe("0");

    sized(506, 506);
    expect(screen.queryByRole("region", { name: "All packages table, scrolls sideways" })).toBeNull();
  });
});

describe("ActiveFilters (PD-RAIL-4)", () => {
  function renderFilters(state: State) {
    const model = composite();
    const dispatch = vi.fn<(action: Action) => void>();
    const input = createRef<HTMLInputElement>();
    const result = render(
      <ReportContext.Provider
        value={{
          model,
          state,
          dispatch,
          now: new Date(model.report.generated_at),
          wide: true,
          cursor: null,
          openGlossary: vi.fn(),
        }}
      >
        <input ref={input} aria-label="search" />
        <ActiveFilters inputRef={input} />
      </ReportContext.Provider>,
    );
    return { ...result, dispatch };
  }

  it("lists nothing when nothing narrows the list", () => {
    renderFilters(INITIAL_STATE);

    expect(screen.queryByRole("group", { name: "Filtered by" })).toBeNull();
  });

  it("lists each selection and the search, each removing only itself", () => {
    const state: State = {
      ...INITIAL_STATE,
      q: " symfony ",
      filters: { ...EMPTY_FILTERS, scope: ["direct"], verdict: ["high"] },
    };
    const { dispatch } = renderFilters(state);

    const chips = within(screen.getByRole("group", { name: "Filtered by" })).getAllByRole("button");
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Remove filter: Verdict high",
      "Remove filter: Scope Direct",
      "Remove filter: Search “symfony”",
    ]);

    fireEvent.click(chips[1] as HTMLElement);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "toggle", group: "scope", key: "direct" });
    fireEvent.click(chips[2] as HTMLElement);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "query", q: "" });
  });

  it("does not list the accepted toggle, which narrows no list", () => {
    renderFilters({ ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, accepted: ["hide"] } });

    expect(screen.queryByRole("group", { name: "Filtered by" })).toBeNull();
  });
});
