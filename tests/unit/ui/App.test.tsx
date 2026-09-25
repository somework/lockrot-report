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

/** Stubs matchMedia: the layout and the OS colour preference, per test. */
function media({ wide = true, narrow = false, dark = false } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1181")
      ? wide
      : query.includes("759")
        ? narrow
        : query.includes("dark")
          ? dark
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

describe("boot", () => {
  test("opens the first flagged package on a wide screen, and keeps it out of the address", async () => {
    render(<App model={MINI} />);
    expect(detailName()).toBe("vendor/transitive");
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

  test("bootState leaves a named package alone and never auto-picks on a narrow screen", () => {
    expect(bootState(MINI, "#pkg=x", true)).toMatchObject({ pkg: "x", pkgAuto: false });
    expect(bootState(MINI, "", false)).toMatchObject({ pkg: null });
    expect(bootState(MINI, "", true)).toMatchObject({ pkg: "vendor/transitive", pkgAuto: true });
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

  test("Enter on a row toggles it; Enter on a link inside the row does not (M5)", () => {
    render(<App model={MINI} />);
    fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
    const row = screen.getByRole("option", { name: "vendor/snapshot" });
    key("Enter", row);
    expect(detailName()).toBe("vendor/snapshot");
    key("Enter", row);
    expect(detailName()).toBeNull();
    const link = row.querySelector("a");
    if (link === null) throw new Error("the stand-in row has a link");
    key("Enter", link);
    expect(detailName()).toBeNull();
  });

  test("/ focuses the search box; j typed there is text", () => {
    render(<App model={MINI} />);
    key("/");
    const search = screen.getByRole("searchbox");
    expect(document.activeElement).toBe(search);
    key("j", search);
    expect(detailName()).toBe("vendor/transitive"); // the boot pick, untouched
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
    expect(detailName()).toBe("vendor/transitive");
    key("Escape");
    await waitFor(() => {
      expect((dialog as HTMLDialogElement).open).toBe(false);
    });
    expect(detailName()).toBe("vendor/transitive");
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

  test("the priority counts sit above the ledger, on a wide screen", () => {
    render(<App model={MINI} />);
    const band = document.querySelector(".ledger-band");
    expect(band?.querySelector(".summary")).not.toBeNull();
    expect(band?.textContent).toContain("1 high");
    expect(band?.textContent).toContain("1 medium");
    expect(band?.textContent).toContain("of 4 packages");
  });

  test("a narrow screen's folded summary shows the same priority counts, not 'N flagged of M packages'", () => {
    media({ wide: false, narrow: true });
    render(<App model={MINI} />);
    const summary = screen.getByText("Summary").closest("summary");
    expect(summary?.textContent).toContain("1 high");
    expect(summary?.textContent).toContain("1 medium");
    expect(summary?.textContent).toContain("of 4 packages");
    expect(summary?.textContent).not.toMatch(/flagged of/);
  });

  // PD-SUMMARY-5 (DESIGN.md §5): before this, the fold's own <summary> carried the counts as text
  // only — a phone reader saw no chart at all until they tapped it open. A small, non-interactive
  // echo of the ledger's own priority bar now sits inside that same <summary>.
  test("a narrow screen's folded summary carries a non-interactive priority bar of its own", () => {
    media({ wide: false, narrow: true });
    render(<App model={MINI} />);
    const summary = screen.getByText("Summary").closest("summary") as HTMLElement;
    const bar = summary.querySelector(".summary-bar");
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    // Non-interactive: no role, no button, nothing a keyboard or a screen reader stops on — the
    // counts line right beside it already gives the same numbers in words.
    expect(bar?.getAttribute("role")).toBeNull();
    expect(bar?.querySelectorAll("button, a, [role]")).toHaveLength(0);
    expect(bar?.querySelectorAll(".bar-seg").length).toBeGreaterThan(0);
  });

  test("the wide ledger band carries no priority bar duplicate — only the folded phone summary does", () => {
    render(<App model={MINI} />);
    expect(document.querySelector(".summary-bar")).toBeNull();
  });

  test("the header carries the run's gate as a quiet fact, mini.json's fail-on being 'silent'", () => {
    render(<App model={MINI} />);
    const button = screen.getByRole("button", { name: /^gate: silent/ });
    expect(button.getAttribute("title")).toContain("told to fail on silent");
    expect(button.getAttribute("title")).toContain("does not record whether it did");
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
