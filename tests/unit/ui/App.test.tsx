import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { bootState, stateFromHashChange } from "../../../src/ui/useHashState";
import { INITIAL_STATE } from "../../../src/state/types";

// The list views and the detail pane are other surfaces with their own tests. Here they are
// stand-ins that expose exactly what the shell relies on: rows carrying `data-pkg` in the order
// `renderedPackages` reports, and a detail region with a Close button.
vi.mock("../../../src/ui/views/order", async () => {
  const { population } = await import("../../../src/domain/filters");
  return {
    renderedPackages: (model: Model, _state: unknown, view: "findings" | "packages" | "run") =>
      population(model, view).map((f) => f.package),
  };
});

vi.mock("../../../src/ui/views/Views", async () => {
  const { useReport } = await import("../../../src/ui/context");
  const { renderedPackages } = await import("../../../src/ui/views/order");
  return {
    CurrentView: () => {
      const { model, state, dispatch } = useReport();
      return (
        <div>
          {renderedPackages(model, state, state.view).map((pkg) => (
            <div
              key={pkg}
              role="option"
              aria-label={pkg}
              aria-selected={state.pkg === pkg}
              tabIndex={0}
              data-pkg={pkg}
              onClick={() => {
                dispatch({ type: "select", pkg: state.pkg === pkg ? null : pkg });
              }}
            >
              {pkg} <a href="https://packagist.org/">packagist</a>
            </div>
          ))}
        </div>
      );
    },
  };
});

vi.mock("../../../src/ui/detail/Detail", async () => {
  const { useReport } = await import("../../../src/ui/context");
  return {
    Detail: ({ onClose }: { onClose: () => void }) => {
      const { state } = useReport();
      return (
        <section aria-label={state.pkg ?? ""}>
          <h2 tabIndex={-1} data-detail-focus="">
            {state.pkg}
          </h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </section>
      );
    },
  };
});

function loadModel(name: string): Model {
  const result = normalize(JSON.parse(readFileSync(`fixtures/bundles/${name}.json`, "utf8")));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

const MINI = loadModel("mini");

/** Stubs matchMedia: the layout, the OS colour preference and reduced motion, per test. */
function media({ wide = true, narrow = false, dark = false, reduce = false } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1181")
      ? wide
      : query.includes("759")
        ? narrow
        : query.includes("dark")
          ? dark
          : query.includes("reduced-motion")
            ? reduce
            : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function detailName(): string | null {
  return screen.queryByRole("region")?.getAttribute("aria-label") ?? null;
}

function key(k: string, target: Element = document.body) {
  fireEvent.keyDown(target, { key: k });
}

beforeEach(() => {
  media();
  history.replaceState(null, "", "/report.html");
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => {
  cleanup();
});

function shellClasses(): string[] {
  return Array.from(document.querySelector(".shell")?.classList ?? []);
}

describe("boot", () => {
  // PD-ROWS-9: the legacy page (and this one until the ledger rows) opened the first flagged
  // package by itself on a wide screen. Now the list takes the full width until the reader opens a
  // row, so the dense one-line rows are what a wide screen shows first.
  test("opens no package on a wide screen: the list keeps the full width and the address stays bare", async () => {
    render(<App model={MINI} />);
    expect(detailName()).toBeNull();
    expect(shellClasses()).toContain("no-detail");
    expect(document.querySelector(".shell-detail")).toBeNull();
    await waitFor(() => {
      expect(location.hash).toBe("");
    });
  });

  test("a deep link still opens its package on load, beside the list on a wide screen", async () => {
    history.replaceState(null, "", "/report.html#pkg=vendor%2Ftransitive");
    render(<App model={MINI} />);
    expect(detailName()).toBe("vendor/transitive");
    expect(shellClasses()).not.toContain("no-detail");
    expect(document.querySelector(".shell-detail")?.classList.contains("is-side")).toBe(true);
    await waitFor(() => {
      expect(location.hash).toBe("#pkg=vendor%2Ftransitive");
    });
  });

  test("a row opened on a wide screen reaches the address, and closing it gives the list its width back", async () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("option", { name: "vendor/snapshot" }));
    expect(detailName()).toBe("vendor/snapshot");
    expect(shellClasses()).not.toContain("no-detail");
    await waitFor(() => {
      expect(location.hash).toBe("#pkg=vendor%2Fsnapshot");
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(detailName()).toBeNull();
    expect(shellClasses()).toContain("no-detail");
    await waitFor(() => {
      expect(location.hash).toBe("");
    });
  });

  test("opens nothing on a narrow screen", () => {
    media({ wide: false, narrow: true });
    render(<App model={MINI} />);
    expect(detailName()).toBeNull();
    expect(document.body.classList.contains("detail-open")).toBe(false);
  });

  test("restores the view and the package from the address", () => {
    history.replaceState(null, "", "/report.html#view=packages&pkg=vendor%2Fsnapshot");
    render(<App model={MINI} />);
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("All packages");
    expect(detailName()).toBe("vendor/snapshot");
  });

  test("bootState is the address alone: a named package opens, an unnamed one never does", () => {
    expect(bootState("#pkg=x")).toMatchObject({ pkg: "x" });
    expect(bootState("")).toEqual(INITIAL_STATE);
    expect(bootState("#view=packages")).toMatchObject({ view: "packages", pkg: null });
  });

  test("a pasted link replaces the state but keeps the table's sort", () => {
    const current = { ...INITIAL_STATE, sort: "libyears" as const, q: "old", pkg: "a" };
    expect(stateFromHashChange("#view=radius", current)).toMatchObject({
      view: "radius",
      q: "",
      pkg: null,
      sort: "libyears",
    });
  });
});

describe("tabs", () => {
  test("show whole-report counts and switch views, closing the detail", () => {
    render(<App model={MINI} />);
    const packages = screen.getByRole("tab", { name: /All packages/ });
    expect(packages.textContent).toBe("All packages4");
    expect(screen.getByRole("tab", { name: /Run data/ }).textContent).toBe("Run data2");
    fireEvent.click(packages);
    expect(packages.getAttribute("aria-selected")).toBe("true");
    expect(detailName()).toBeNull();
  });

  test("arrow keys move between tabs", () => {
    render(<App model={MINI} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /Findings/ }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Run data");
  });

  test("a hashchange applies the new address", async () => {
    render(<App model={MINI} />);
    history.replaceState(null, "", "/report.html#view=radius");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Blast radius");
    });
  });

  // A first-time-reader walk: scrolled deep into Findings, then switched tabs and landed mid-list
  // in a shorter tab, with nothing on screen explaining why.
  test("a clicked tab scrolls the page back to the top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<App model={MINI} />);

    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  test("a hashchange restore does not fight a reader's own scroll position", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<App model={MINI} />);

    history.replaceState(null, "", "/report.html#view=radius");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Blast radius");
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  // Regression: Tabs.tsx dispatches "view" even for the tab already selected (it closes the open
  // detail), which used to latch the "a reader changed tabs" flag without the effect that clears it
  // ever running (the effect depends on `state.view`, which did not change). The flag then stayed
  // set for the *next* view change for any reason, including this hashchange restore.
  test("clicking the already-selected tab first does not make a later hashchange restore scroll", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<App model={MINI} />);

    fireEvent.click(screen.getByRole("tab", { name: /Findings/ }));
    expect(scrollTo).not.toHaveBeenCalled();

    history.replaceState(null, "", "/report.html#view=packages");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(screen.getByRole("tab", { selected: true }).textContent).toContain("All packages");
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("keyboard", () => {
  test("j and k walk the rows on screen and open each one", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    expect(detailName()).toBe("vendor/transitive");
    key("j");
    expect(detailName()).toBe("vendor/snapshot");
    key("k");
    expect(detailName()).toBe("vendor/transitive");
  });

  // PD-ROWS-10: focus used to stay wherever it was while `j` opened a row, and reached the row only
  // once Escape closed it again, so a keyboard reader saw no ring on the package `j` had opened.
  test("j and k put focus on the row they open", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    expect(document.activeElement?.getAttribute("data-pkg")).toBe("vendor/transitive");
    key("j");
    expect(document.activeElement?.getAttribute("data-pkg")).toBe("vendor/snapshot");
    key("k");
    expect(document.activeElement?.getAttribute("data-pkg")).toBe("vendor/transitive");
  });

  test("Escape closes the detail and gives focus back to its row", async () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    key("Escape");
    expect(detailName()).toBeNull();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-pkg")).toBe("vendor/transitive");
    });
  });

  test("Enter on a row opens it and a second Enter keeps it open (PD-ROWS-7); Enter on a link inside the row does not (M5)", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    const row = screen.getByRole("option", { name: "vendor/snapshot" });
    key("Enter", row);
    expect(detailName()).toBe("vendor/snapshot");
    key("Enter", row);
    expect(detailName()).toBe("vendor/snapshot");
    key("Escape");
    expect(detailName()).toBeNull();
    const link = row.querySelector("a");
    if (link === null) throw new Error("the stand-in row has a link");
    key("Enter", link);
    expect(detailName()).toBeNull();
  });

  // PD-ROWS-11 (M5's mismatch): a click left focus on the clicked row while `j` moved the open
  // package on, so the Enter after the walk opened the clicked row again, not the one `j` reached.
  test("after a click, j moves focus with the open package, so Enter opens the row j reached", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    const first = screen.getByRole("option", { name: "vendor/transitive" });
    first.focus();
    fireEvent.click(first);
    expect(detailName()).toBe("vendor/transitive");

    key("j", first);
    expect(detailName()).toBe("vendor/snapshot");
    const focused = document.activeElement;
    expect(focused?.getAttribute("data-pkg")).toBe("vendor/snapshot");

    key("Enter", focused ?? document.body);
    expect(detailName()).toBe("vendor/snapshot");
  });

  test("after Escape hands focus back to a row, j continues below it, not from the top", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    key("j");
    expect(detailName()).toBe("vendor/snapshot");
    key("Escape");
    expect(detailName()).toBeNull();
    const row = document.activeElement;
    expect(row?.getAttribute("data-pkg")).toBe("vendor/snapshot");
    const third = screen.getAllByRole("option")[2]?.getAttribute("data-pkg");

    // The legacy cursor started again at -1 with nothing open, so this `j` opened the first row.
    key("j", row ?? document.body);
    expect(detailName()).toBe(third);
    expect(third).not.toBe("vendor/transitive");
  });

  test("Escape typed in the search box closes the detail and leaves focus in the box", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    const search = screen.getByRole("searchbox");
    search.focus();

    key("Escape", search);
    expect(detailName()).toBeNull();
    expect(document.activeElement).toBe(search);
  });

  test("a row j walks to glides into view, or jumps under prefers-reduced-motion", () => {
    const behaviours: (ScrollBehavior | undefined)[] = [];
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
      (options?: boolean | ScrollIntoViewOptions) => {
        if (typeof options === "object" && options.block === "nearest") behaviours.push(options.behavior);
      },
    );
    for (const reduce of [false, true]) {
      media({ reduce });
      render(<App model={MINI} />);
      fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
      key("j");
      cleanup();
    }

    expect(behaviours).toEqual(["smooth", "auto"]);
    vi.restoreAllMocks();
  });

  // PD-ROWS-12: a second Escape used to blur the box to the page, so Tab started again at the top.
  test("Escape from the search box with nothing open hands focus to the list's Tab stop", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    key("j");
    key("Escape");
    const search = screen.getByRole("searchbox");
    search.focus();

    key("Escape", search);
    expect(detailName()).toBeNull();
    expect(document.activeElement?.getAttribute("data-pkg")).toBe("vendor/snapshot");
  });

  test("/ focuses the search box; j typed there is text", () => {
    render(<App model={MINI} />);
    key("/");
    const search = screen.getByRole("searchbox");
    expect(document.activeElement).toBe(search);
    key("j", search);
    expect(detailName()).toBeNull(); // j typed as text never opened the first row
  });
});

// PD-ROWS-12: below the wide layout the detail is a sheet over the whole page, so the row that holds
// focus is under it and its ring out of sight (WCAG 2.4.11). Focus goes into the sheet instead, and
// everything the sheet covers is inert until it closes.
describe("a sheet over the page takes focus (PD-ROWS-12)", () => {
  function sheetHeading(): Element | null {
    return document.querySelector(".shell-detail [data-detail-focus]");
  }

  test("a clicked row opens the sheet with focus on its heading, and the page under it inert", () => {
    media({ wide: false });
    render(<App model={MINI} />);
    const row = screen.getByRole("option", { name: "vendor/snapshot" });
    row.focus();
    fireEvent.click(row);

    expect(detailName()).toBe("vendor/snapshot");
    expect(document.activeElement).toBe(sheetHeading());
    expect(document.querySelector(".shell-main")?.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("banner").hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("contentinfo").hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".ledger-band")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".shell-detail")?.closest("[inert]")).toBeNull();
  });

  test("j and k keep focus in the sheet, and Escape hands it to the row they reached", () => {
    media({ wide: false });
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    key("j");
    expect(detailName()).toBe("vendor/transitive");
    expect(document.activeElement).toBe(sheetHeading());
    key("j", document.activeElement ?? document.body);
    expect(detailName()).toBe("vendor/snapshot");
    expect(document.activeElement).toBe(sheetHeading());
    expect(sheetHeading()?.textContent).toBe("vendor/snapshot");

    key("Escape", document.activeElement ?? document.body);
    expect(detailName()).toBeNull();
    expect(document.activeElement?.getAttribute("data-pkg")).toBe("vendor/snapshot");
    expect(document.querySelector("[inert]")).toBeNull();
  });

  test("/ closes the sheet and focuses the search box it covered", () => {
    media({ wide: false });
    render(<App model={MINI} />);
    key("j");
    expect(detailName()).not.toBeNull();

    key("/", document.activeElement ?? document.body);
    expect(detailName()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  test("a sheet the address opened on load leaves focus alone", () => {
    media({ wide: false });
    history.replaceState(null, "", "/report.html#pkg=vendor%2Fsnapshot");
    render(<App model={MINI} />);
    expect(detailName()).toBe("vendor/snapshot");
    expect(document.activeElement).toBe(document.body);
  });

  test("a detail beside the list takes nothing inert and leaves focus on the row", () => {
    render(<App model={MINI} />);
    const row = screen.getByRole("option", { name: "vendor/snapshot" });
    row.focus();
    fireEvent.click(row);
    expect(document.activeElement).toBe(row);
    expect(document.querySelector("[inert]")).toBeNull();
  });
});

// PD-ROWS-10: from 1181px up, opening a package narrows the list and closing it widens it again, and
// the Findings rows change height with the list's width, so the clicked row slid off the screen.
// happy-dom lays nothing out, so the stand-in rows report the top a real row would: one place with
// the list at full width, another with the detail beside it.
describe("the row a reader acts on keeps its place (PD-ROWS-10)", () => {
  function rowsSitAt(closed: number, open: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => {
      const top = document.querySelector(".shell-detail") === null ? closed : open;
      return { top, bottom: top + 36 } as DOMRect;
    });
    return vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("opening a row scrolls the page by however far the row moved, and closing it scrolls back", () => {
    const scrollBy = rowsSitAt(480, 869);
    render(<App model={MINI} />);

    fireEvent.click(screen.getByRole("option", { name: "vendor/snapshot" }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenLastCalledWith(0, 389);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy).toHaveBeenLastCalledWith(0, -389);
  });

  test("Escape and j keep their row in place the same way", () => {
    const scrollBy = rowsSitAt(300, 420);
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));

    key("j");
    expect(scrollBy).toHaveBeenLastCalledWith(0, 120);
    key("Escape");
    expect(scrollBy).toHaveBeenLastCalledWith(0, -120);
  });

  test("a row that did not move scrolls nothing: a sheet over the page, or a detail already open", () => {
    const scrollBy = rowsSitAt(480, 480);
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("option", { name: "vendor/snapshot" }));
    fireEvent.click(screen.getByRole("option", { name: "vendor/transitive" }));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("a #pkg= link brings its row into view on load; a bare address scrolls nothing", () => {
    const scrolled: (string | null)[] = [];
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (
      this: HTMLElement,
      options?: boolean | ScrollIntoViewOptions,
    ) {
      if (typeof options === "object" && options.block === "center")
        scrolled.push(this.getAttribute("data-pkg"));
    });

    render(<App model={MINI} />);
    expect(scrolled).toEqual([]);
    cleanup();

    history.replaceState(null, "", "/report.html#pkg=vendor%2Fsnapshot");
    render(<App model={MINI} />);
    expect(scrolled).toEqual(["vendor/snapshot"]);
  });
});

describe("glossary", () => {
  test("? opens it, it lists S10, and j does nothing behind it (M10)", async () => {
    render(<App model={MINI} />);
    key("?");
    const dialog = await screen.findByRole("dialog", { name: "What these words mean" });
    expect(dialog.textContent).toContain("S10");
    expect(dialog.textContent).toContain("a check could not run");
    key("j");
    expect(detailName()).toBeNull(); // j behind the dialog did not open the first row
    key("Escape");
    await waitFor(() => {
      expect((dialog as HTMLDialogElement).open).toBe(false);
    });
    expect(detailName()).toBeNull();
  });

  test("falls back to a pinned open dialog when showModal() throws (M28)", async () => {
    const spy = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {
      throw new Error("modals are not allowed here");
    });
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("button", { name: "What these words mean" }));
    const dialog = await screen.findByRole("dialog", { name: "What these words mean" });
    await waitFor(() => {
      expect(dialog.className).toContain("is-fallback");
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(dialog.hasAttribute("open")).toBe(false);
    });
    spy.mockRestore();
  });
});

describe("theme", () => {
  test("the button names the other theme and persists the choice", () => {
    render(<App model={MINI} />);
    const button = screen.getByRole("button", { name: "Dark" });
    fireEvent.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("lockrot-theme")).toBe("dark");
    expect(button.textContent).toBe("Light");
  });

  test("under an OS dark preference the first click goes light (M11)", () => {
    media({ dark: true });
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("restores a saved theme", () => {
    localStorage.setItem("lockrot-theme", "dark");
    render(<App model={MINI} />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();
  });
});

describe("layout", () => {
  test("a narrow screen folds the rail into a Filters disclosure and locks scroll under a sheet", () => {
    media({ wide: false, narrow: true });
    render(<App model={MINI} />);
    expect(screen.getByText("Filters").closest("details")).not.toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "vendor/snapshot" }));
    expect(document.body.classList.contains("detail-open")).toBe(true);
  });

  test("the header names the project, target and data date; the footer names the version", () => {
    render(<App model={MINI} />);
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("acme/app");
    expect(banner.textContent).toContain("target PHP 8.4");
    expect(screen.getByRole("contentinfo").textContent).toContain("Generated by lockrot");
  });

  test("the summary band leads with the flagged figure and its priority chips, on a wide screen", () => {
    render(<App model={MINI} />);
    const band = document.querySelector(".ledger-band");
    expect(band?.querySelector(".ledger-lead .lead-num")?.textContent).toBe("2");
    expect(band?.textContent).toContain("of 4 packages");
    expect(screen.getByRole("button", { name: "high 1" })).toBeTruthy();
    // No fold on a wide screen: the supporting columns sit in the band itself.
    expect(band?.querySelector("details")).toBeNull();
    expect(band?.querySelector(".ledger-tier")).not.toBeNull();
  });

  // PD-SUMMARY-6 (DESIGN.md §5/§8): on a phone the lead stays in view, and only the supporting tier
  // folds, behind a line that counts what it holds.
  test("a narrow screen keeps the lead unfolded and folds only the tier", () => {
    media({ wide: false, narrow: true });
    render(<App model={MINI} />);
    const lead = document.querySelector(".ledger-lead");
    expect(lead?.closest("details")).toBeNull();
    expect(lead?.textContent).toContain("of 4 packages");
    const summary = screen.getByText("More about this lock").closest("summary");
    expect(summary?.textContent).toContain("2 reasons · no advisories · libyears not measured");
    expect(summary?.parentElement?.querySelector(".ledger-tier")).not.toBeNull();
  });

  test("the header carries the run's gate as a quiet fact, mini.json's fail-on being 'silent'", () => {
    render(<App model={MINI} />);
    const button = screen.getByRole("button", { name: /^gate: silent/ });
    expect(button.getAttribute("title")).toContain("told to fail on silent");
    expect(button.getAttribute("title")).toContain("does not record the run's exit code");
  });

  test("beside the gate, a count of the findings at or above it (PD-BASELINE-5)", () => {
    render(<App model={MINI} />);
    // mini.json: one abandoned finding reaches silent; the pinned one does not.
    expect(document.querySelector(".gate-tally")?.textContent).toBe("1 at or above");
    const button = screen.getByRole("button", { name: /^gate: silent/ });
    expect(button.getAttribute("title")).toContain("1 finding in this report is at or above silent.");
  });

  test("with a baseline, the gate count also says how many the baseline does not accept (PD-BASELINE-5)", () => {
    render(<App model={loadModel("wallabag_baseline")} />);
    // "of them": the 4 is a subset of the 41 (2 new + 2 worsened at or above high), never the
    // delta line's "4 new", which the evaluator found it read as.
    expect(document.querySelector(".gate-tally")?.textContent).toBe(
      "41 at or above · 4 of them not accepted",
    );
    const title = screen.getByRole("button", { name: /^gate: high/ }).getAttribute("title") ?? "";
    expect(title).toContain(
      "41 findings in this report are at or above high; 4 of them are not already accepted in lockrot-baseline.json.",
    );
    // The caveat stays last, and names what it cannot know outright: "whether it did" lost its
    // antecedent once the count sentence came between it and the rule.
    expect(title.endsWith("The page does not record the run's exit code.")).toBe(true);
  });

  // PD-BASELINE-6: the subset is one press from the header.
  test("the tally's 'of them not accepted' lists exactly those findings on Findings", () => {
    render(<App model={loadModel("wallabag_baseline")} />);
    fireEvent.click(screen.getByRole("tab", { name: /Run data/ }));
    fireEvent.click(screen.getByRole("button", { name: "4 of them not accepted" }));
    expect(screen.getByRole("tab", { name: /Findings/ }).getAttribute("aria-selected")).toBe("true");
    expect(window.location.hash).toBe("#prio=critical%2Chigh&since=new%2Cworsened");
    // The views are mocked here; e2e/baseline.spec.ts checks the four rows themselves.
    const rail = screen.getByRole("group", { name: "Filters" });
    expect(within(rail).getByRole("button", { name: /^New/ }).getAttribute("aria-pressed")).toBe("true");
    expect(
      within(rail)
        .getByRole("button", { name: /^Worsened/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("no gate, no count", () => {
    render(<App model={loadModel("wallabag_wallabag")} />);
    expect(document.querySelector(".gate-tally")).toBeNull();
  });

  // regression review: neither an e2e nor a unit test asserted this branch (Header.tsx: `run.failOn
  // === null` renders neither label) — only that a *present* fail-on renders correctly.
  test("a document that predates run.fail_on shows no gate fact at all (PD-SUMMARY-2)", () => {
    render(<App model={loadModel("mini-no-fail-on")} />);
    expect(screen.queryByRole("button", { name: /gate/i })).toBeNull();
  });

  test("a document with a newer schema says so", () => {
    render(<App model={{ ...MINI, schema: 2, newerSchema: true }} />);
    expect(screen.getByText(/This report is newer than this page/)).toBeTruthy();
  });
});
