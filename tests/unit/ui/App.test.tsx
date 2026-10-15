import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2Embed } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { INITIAL_STATE } from "../../../src/state/types";
import { App } from "../../../src/ui/App";
import { bootState, stateFromHashChange } from "../../../src/ui/useHashState";

/** Seven graded findings, none dev: 6 direct requirements and 1 transitive package. No project name
 *  and no baseline; the gate fails on `--fail-on=high`. */
function load(caseName = "composite", edit: (embed: Report2Embed) => void = () => undefined): Model {
  const embed = assembleEmbed(caseName);
  edit(embed);
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** The Findings rows in rank order, which is also the order All packages opens in. */
const BY_RANK = [
  "twig/twig",
  "symfony/monolog-bridge",
  "symfony/debug",
  "friendsofsymfony/oauth-server-bundle",
  "tubalmartin/cssmin",
  "symfony/yaml",
  "symfony/polyfill-intl-idn",
];

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
  return screen.queryByRole("complementary")?.getAttribute("aria-label") ?? null;
}

function row(pkg: string): HTMLElement {
  return screen.getByRole("listitem", { name: pkg });
}

function key(k: string, target: Element = document.body) {
  fireEvent.keyDown(target, { key: k });
}

function selectedTab(): string {
  return screen.getByRole("tab", { selected: true }).textContent;
}

function shellClasses(): string[] {
  return Array.from(document.querySelector(".shell")?.classList ?? []);
}

function openPackages() {
  fireEvent.click(screen.getByRole("tab", { name: /All packages/ }));
}

beforeEach(() => {
  media();
  history.replaceState(null, "", "/report.html");
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("boot", () => {
  test("opens no package on a wide screen: the list keeps the full width and the address stays bare", async () => {
    render(<App model={load()} />);

    expect(detailName()).toBeNull();
    expect(shellClasses()).toContain("no-detail");
    expect(document.querySelector(".shell-detail")).toBeNull();
    await waitFor(() => {
      expect(location.hash).toBe("");
    });
  });

  test("a deep link opens its package on load, beside the list on a wide screen", async () => {
    history.replaceState(null, "", "/report.html#pkg=symfony%2Fdebug");

    render(<App model={load()} />);

    expect(detailName()).toBe("symfony/debug");
    expect(shellClasses()).not.toContain("no-detail");
    expect(document.querySelector(".shell-detail")?.classList.contains("is-side")).toBe(true);
    await waitFor(() => {
      expect(location.hash).toBe("#pkg=symfony%2Fdebug");
    });
  });

  test("a row opened on a wide screen reaches the address, and closing it gives the list its width back", async () => {
    render(<App model={load()} />);
    fireEvent.click(row("symfony/yaml"));
    expect(detailName()).toBe("symfony/yaml");
    expect(shellClasses()).not.toContain("no-detail");
    await waitFor(() => {
      expect(location.hash).toBe("#pkg=symfony%2Fyaml");
    });

    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Close" }));

    expect(detailName()).toBeNull();
    expect(shellClasses()).toContain("no-detail");
    await waitFor(() => {
      expect(location.hash).toBe("");
    });
  });

  test("opens nothing on a narrow screen", () => {
    media({ wide: false, narrow: true });

    render(<App model={load()} />);

    expect(detailName()).toBeNull();
    expect(document.body.classList.contains("detail-open")).toBe(false);
  });

  test("restores the view and the package from the address", () => {
    history.replaceState(null, "", "/report.html#view=packages&pkg=symfony%2Fdebug");

    render(<App model={load()} />);

    expect(selectedTab()).toContain("All packages");
    expect(detailName()).toBe("symfony/debug");
  });

  test("an address asking for the failing rows of a run that nothing fails lists every row", async () => {
    history.replaceState(null, "", "/report.html#gate=fails");

    render(<App model={load("B-gate-none")} />);

    expect(screen.queryByRole("button", { name: /^Fails this run/ })).toBeNull();
    await waitFor(() => {
      expect(location.hash).toBe("");
    });
    expect(document.querySelectorAll("li[data-pkg]")).toHaveLength(1);
  });

  test("bootState is the address alone: a named package opens, an unnamed one never does", () => {
    expect(bootState("#pkg=x")).toMatchObject({ pkg: "x" });
    expect(bootState("")).toEqual(INITIAL_STATE);
    expect(bootState("#view=packages")).toMatchObject({ view: "packages", pkg: null });
  });

  test("a pasted link replaces the state but keeps the table's sort and the Blast radius folds", () => {
    const current = {
      ...INITIAL_STATE,
      sort: "libyears" as const,
      q: "old",
      pkg: "a",
      disclosure: { "fold:singles": true },
    };

    expect(stateFromHashChange("#view=radius", current)).toMatchObject({
      view: "radius",
      q: "",
      pkg: null,
      sort: "libyears",
      disclosure: { "fold:singles": true },
    });
  });
});

describe("tabs", () => {
  test("show whole-report counts and switch views, closing the detail", () => {
    render(<App model={load()} />);
    fireEvent.click(row("symfony/yaml"));
    expect(detailName()).toBe("symfony/yaml");

    const packages = screen.getByRole("tab", { name: "All packages 7" });
    expect(screen.getByRole("tab", { name: "Run data" })).toBeTruthy();
    fireEvent.click(packages);

    expect(packages.getAttribute("aria-selected")).toBe("true");
    expect(detailName()).toBeNull();
  });

  test("arrow keys move between tabs, wrapping at both ends, and Home and End jump to them", () => {
    render(<App model={load()} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /^Findings/ }), { key: "ArrowLeft" });
    expect(selectedTab()).toContain("Run data");
    fireEvent.keyDown(screen.getByRole("tab", { name: /^Run data/ }), { key: "ArrowRight" });
    expect(selectedTab()).toContain("Findings");
    fireEvent.keyDown(screen.getByRole("tab", { name: /^Findings/ }), { key: "End" });
    expect(selectedTab()).toContain("Run data");
    fireEvent.keyDown(screen.getByRole("tab", { name: /^Run data/ }), { key: "Home" });
    expect(selectedTab()).toContain("Findings");
  });

  test("a hashchange applies the new address", async () => {
    render(<App model={load()} />);

    history.replaceState(null, "", "/report.html#view=radius");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await waitFor(() => {
      expect(selectedTab()).toContain("Blast radius");
    });
  });

  test("a clicked tab scrolls the page back to the top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<App model={load()} />);

    openPackages();

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  test("a hashchange restore does not fight a reader's own scroll position", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<App model={load()} />);

    history.replaceState(null, "", "/report.html#view=radius");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(selectedTab()).toContain("Blast radius");
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("clicking the already-selected tab first does not make a later hashchange restore scroll", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<App model={load()} />);

    fireEvent.click(screen.getByRole("tab", { name: /^Findings/ }));
    expect(scrollTo).not.toHaveBeenCalled();

    history.replaceState(null, "", "/report.html#view=packages");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(selectedTab()).toContain("All packages");
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("keyboard", () => {
  test.each([
    ["Findings", ""],
    ["All packages", "#view=packages"],
  ])("j and k walk the %s rows on screen and open each one", (_tab, hash) => {
    history.replaceState(null, "", `/report.html${hash}`);
    render(<App model={load()} />);

    key("j");
    expect(detailName()).toBe(BY_RANK[0]);
    key("j");
    expect(detailName()).toBe(BY_RANK[1]);
    key("k");
    expect(detailName()).toBe(BY_RANK[0]);
  });

  test("j and k put focus on the row they open", () => {
    render(<App model={load()} />);

    key("j");
    expect(document.activeElement?.getAttribute("data-pkg")).toBe(BY_RANK[0]);
    key("j");
    expect(document.activeElement?.getAttribute("data-pkg")).toBe(BY_RANK[1]);
    key("k");
    expect(document.activeElement?.getAttribute("data-pkg")).toBe(BY_RANK[0]);
  });

  test("j walks the Advisories rows one by one, a package listed under three advisories included", () => {
    history.replaceState(null, "", "/report.html#view=advisories");
    render(<App model={load()} />);

    const walked: (string | null)[] = [];
    for (let step = 0; step < 6; step += 1) {
      key("j", document.activeElement ?? document.body);
      walked.push(document.activeElement?.getAttribute("data-pkg") ?? null);
    }

    // One row for polyfill-intl-idn, three for yaml, one for monolog-bridge, then twig/twig's.
    expect(walked).toEqual([
      "symfony/polyfill-intl-idn",
      "symfony/yaml",
      "symfony/yaml",
      "symfony/yaml",
      "symfony/monolog-bridge",
      "twig/twig",
    ]);
  });

  test("Escape closes the detail and gives focus back to its row", async () => {
    render(<App model={load()} />);
    key("j");

    key("Escape");

    expect(detailName()).toBeNull();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-pkg")).toBe(BY_RANK[0]);
    });
  });

  test("Enter on a row opens it and a second Enter keeps it open; Enter on a link inside a row does not", () => {
    history.replaceState(null, "", "/report.html#view=advisories");
    render(<App model={load()} />);
    const first = document.querySelector<HTMLElement>("li[data-pkg]");
    if (first === null) throw new Error("the Advisories tab lists a row");
    const pkg = first.getAttribute("data-pkg");

    key("Enter", first);
    expect(detailName()).toBe(pkg);
    key("Enter", first);
    expect(detailName()).toBe(pkg);
    key("Escape");
    expect(detailName()).toBeNull();
    const link = first.querySelector("a");
    if (link === null) throw new Error("an Advisories row links its advisory");
    key("Enter", link);
    expect(detailName()).toBeNull();
  });

  test("after a click, j moves focus with the open package, so Enter opens the row j reached", () => {
    render(<App model={load()} />);
    const first = row(BY_RANK[0] ?? "");
    first.focus();
    fireEvent.click(first);
    expect(detailName()).toBe(BY_RANK[0]);

    key("j", first);
    expect(detailName()).toBe(BY_RANK[1]);
    const focused = document.activeElement;
    expect(focused?.getAttribute("data-pkg")).toBe(BY_RANK[1]);

    key("Enter", focused ?? document.body);
    expect(detailName()).toBe(BY_RANK[1]);
  });

  test("after Escape hands focus back to a row, j continues below it, not from the top", () => {
    render(<App model={load()} />);
    key("j");
    key("j");
    expect(detailName()).toBe(BY_RANK[1]);
    key("Escape");
    expect(detailName()).toBeNull();
    const focused = document.activeElement;
    expect(focused?.getAttribute("data-pkg")).toBe(BY_RANK[1]);

    key("j", focused ?? document.body);

    expect(detailName()).toBe(BY_RANK[2]);
  });

  test("Escape typed in the search box closes the detail and leaves focus in the box", () => {
    render(<App model={load()} />);
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
      render(<App model={load()} />);
      key("j");
      cleanup();
    }

    expect(behaviours).toEqual(["smooth", "auto"]);
  });

  test("Escape from the search box with nothing open hands focus to the list's Tab stop", () => {
    render(<App model={load()} />);
    key("j");
    key("j");
    key("Escape");
    const search = screen.getByRole("searchbox");
    search.focus();

    key("Escape", search);

    expect(detailName()).toBeNull();
    expect(document.activeElement?.getAttribute("data-pkg")).toBe(BY_RANK[1]);
  });

  test("the open package's row is the list's one Tab stop", () => {
    render(<App model={load()} />);
    key("j");
    key("j");

    const stops = [...document.querySelectorAll("li[data-pkg]")]
      .filter((item) => item.getAttribute("tabindex") === "0")
      .map((item) => item.getAttribute("data-pkg"));

    expect(stops).toEqual([BY_RANK[1]]);
  });

  test("/ focuses the search box; j typed there is text", () => {
    render(<App model={load()} />);

    key("/");

    const search = screen.getByRole("searchbox");
    expect(document.activeElement).toBe(search);
    key("j", search);
    expect(detailName()).toBeNull();
  });
});

// Below the wide layout the detail is a sheet over the whole page, so the row that holds focus is
// under it and its ring out of sight (WCAG 2.4.11). Focus goes into the sheet instead, and everything
// the sheet covers is inert until it closes.
describe("a sheet over the page takes focus", () => {
  function sheetHeading(): Element | null {
    return document.querySelector(".shell-detail [data-detail-focus]");
  }

  test("a clicked row opens the sheet with focus on its heading, and the page under it inert", () => {
    media({ wide: false });
    render(<App model={load()} />);
    const target = row("symfony/yaml");
    target.focus();
    fireEvent.click(target);

    expect(detailName()).toBe("symfony/yaml");
    expect(document.activeElement).toBe(sheetHeading());
    expect(document.querySelector(".shell-main")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".topbar")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".colophon")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".ledger-band")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".shell-detail")?.closest("[inert]")).toBeNull();
  });

  test("j and k keep focus in the sheet, and Escape hands it to the row they reached", () => {
    media({ wide: false });
    render(<App model={load()} />);
    key("j");
    expect(detailName()).toBe(BY_RANK[0]);
    expect(document.activeElement).toBe(sheetHeading());
    key("j", document.activeElement ?? document.body);
    expect(detailName()).toBe(BY_RANK[1]);
    expect(document.activeElement).toBe(sheetHeading());
    expect(sheetHeading()?.textContent).toBe(BY_RANK[1]);

    key("Escape", document.activeElement ?? document.body);

    expect(detailName()).toBeNull();
    expect(document.activeElement?.getAttribute("data-pkg")).toBe(BY_RANK[1]);
    expect(document.querySelector("[inert]")).toBeNull();
  });

  test("/ closes the sheet and focuses the search box it covered", () => {
    media({ wide: false });
    render(<App model={load()} />);
    key("j");
    expect(detailName()).not.toBeNull();

    key("/", document.activeElement ?? document.body);

    expect(detailName()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  test("a sheet the address opened on load leaves focus alone", () => {
    media({ wide: false });
    history.replaceState(null, "", "/report.html#pkg=symfony%2Fyaml");

    render(<App model={load()} />);

    expect(detailName()).toBe("symfony/yaml");
    expect(document.activeElement).toBe(document.body);
  });

  test("a detail beside the list takes nothing inert and leaves focus on the row", () => {
    render(<App model={load()} />);
    const target = row("symfony/yaml");
    target.focus();

    fireEvent.click(target);

    expect(document.activeElement).toBe(target);
    expect(document.querySelector("[inert]")).toBeNull();
  });

  test("an address naming a package the report does not list opens a panel with a Close that takes focus", () => {
    media({ wide: false });
    history.replaceState(null, "", "/report.html#pkg=not%2Flisted");

    render(<App model={load()} />);

    expect(detailName()).toBe("not/listed");
    expect(screen.getByText("not/listed is not in this report.")).toBeTruthy();
  });
});

// From 1181px up, opening a package narrows the list and closing it widens it again, and the
// Findings rows change height with the list's width, so the clicked row would slide off the screen.
// happy-dom lays nothing out, so rows report the top a real row would: one place with the list at
// full width, another with the detail beside it.
describe("the row a reader acts on keeps its place", () => {
  function rowsSitAt(closed: number, open: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => {
      const top = document.querySelector(".shell-detail") === null ? closed : open;
      return { top, bottom: top + 36 } as DOMRect;
    });
    return vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
  }

  test("opening a row scrolls the page by however far the row moved, and closing it scrolls back", () => {
    const scrollBy = rowsSitAt(480, 869);
    render(<App model={load()} />);

    fireEvent.click(row("symfony/yaml"));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenLastCalledWith(0, 389);

    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Close" }));
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy).toHaveBeenLastCalledWith(0, -389);
  });

  test("Escape and j keep their row in place the same way", () => {
    const scrollBy = rowsSitAt(300, 420);
    render(<App model={load()} />);

    key("j");
    expect(scrollBy).toHaveBeenLastCalledWith(0, 120);
    key("Escape");
    expect(scrollBy).toHaveBeenLastCalledWith(0, -120);
  });

  test("a row that did not move scrolls nothing: a sheet over the page, or a detail already open", () => {
    const scrollBy = rowsSitAt(480, 480);
    render(<App model={load()} />);

    fireEvent.click(row("symfony/yaml"));
    fireEvent.click(row("symfony/debug"));

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

    render(<App model={load()} />);
    expect(scrolled).toEqual([]);
    cleanup();

    history.replaceState(null, "", "/report.html#pkg=symfony%2Fyaml");
    render(<App model={load()} />);
    expect(scrolled).toEqual(["symfony/yaml"]);
  });
});

describe("glossary", () => {
  test("? opens it, it lists S10, and j does nothing behind it", async () => {
    render(<App model={load()} />);

    key("?");

    const dialog = await screen.findByRole("dialog", { name: "What these words mean" });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(dialog.textContent).toContain("S10");
    expect(dialog.textContent).toContain("could not run for this package");
    key("j");
    expect(detailName()).toBeNull();
    key("Escape");
    await waitFor(() => {
      expect((dialog as HTMLDialogElement).open).toBe(false);
    });
    expect(detailName()).toBeNull();
  });

  test("closing it hands focus back to the button that opened it", async () => {
    render(<App model={load()} />);
    const opener = screen.getByRole("button", { name: "What these words mean" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "What these words mean" });
    expect(document.activeElement?.textContent).toBe("Close");

    key("Escape");

    await waitFor(() => {
      expect((dialog as HTMLDialogElement).open).toBe(false);
    });
    expect(document.activeElement).toBe(opener);
  });

  test("closes before an open detail does", async () => {
    render(<App model={load()} />);
    key("j");
    expect(detailName()).toBe(BY_RANK[0]);
    key("?");
    const dialog = await screen.findByRole("dialog", { name: "What these words mean" });

    key("Escape");

    await waitFor(() => {
      expect((dialog as HTMLDialogElement).open).toBe(false);
    });
    expect(detailName()).toBe(BY_RANK[0]);
  });

  test("falls back to a pinned open dialog when showModal() throws", async () => {
    const spy = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {
      throw new Error("modals are not allowed here");
    });
    render(<App model={load()} />);

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
    render(<App model={load()} />);
    const button = screen.getByRole("button", { name: "Dark" });

    fireEvent.click(button);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("lockrot-theme")).toBe("dark");
    expect(button.textContent).toBe("Light");
  });

  test("under an OS dark preference the first click goes light", () => {
    media({ dark: true });
    render(<App model={load()} />);

    fireEvent.click(screen.getByRole("button", { name: "Light" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("restores a saved theme", () => {
    localStorage.setItem("lockrot-theme", "dark");

    render(<App model={load()} />);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();
  });
});

describe("layout", () => {
  test("a narrow screen folds the rail into a Filters disclosure and locks scroll under a sheet", () => {
    media({ wide: false, narrow: true });
    render(<App model={load()} />);
    expect(screen.getByText("Filters").closest("details")).not.toBeNull();

    fireEvent.click(row("symfony/yaml"));

    expect(document.body.classList.contains("detail-open")).toBe(true);
  });

  test("the Filters fold counts the filters that are on", () => {
    media({ wide: false, narrow: true });
    history.replaceState(null, "", "/report.html#flag=stale,pinned&scope=direct");

    render(<App model={load()} />);

    expect(screen.getByText("Filters").closest("summary")?.textContent).toContain("3 on");
  });

  test("hides the rail and the search box on the Run tab, which lists no package", () => {
    history.replaceState(null, "", "/report.html#view=run");

    render(<App model={load()} />);

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("group", { name: "Filters" })).toBeNull();
    expect(shellClasses()).toContain("no-rail");
  });

  test("the header names the lock, the target and the data date; the footer names the version", () => {
    render(<App model={load()} />);

    const header = document.querySelector(".topbar")?.textContent;
    // The run names no project, so the header falls back to the lock file's usual name.
    expect(header).toContain("composer.lock");
    expect(header).toContain("target PHP 8.4");
    expect(header).toContain("data as of 2026-10-01");
    expect(document.querySelector(".colophon")?.textContent).toContain(
      "Generated by lockrot 0.14.0 on 2026-10-01",
    );
  });

  test("the header names the project when the run has one", () => {
    render(<App model={load("B")} />);

    expect(document.querySelector(".topbar")?.textContent).toContain("matomo/matomo");
  });

  test("a document with a newer schema says so", () => {
    render(<App model={{ ...load(), schema: 3, newerSchema: true }} />);

    expect(screen.getByText(/This report is newer than this page/)).toBeTruthy();
  });

  test("a document of the schema the page reads says nothing of it", () => {
    render(<App model={load()} />);

    expect(screen.queryByText(/newer than this page/)).toBeNull();
  });
});

describe("the header's gate fact", () => {
  function fact(): string | null {
    return document.querySelector(".gate-fact")?.textContent ?? null;
  }

  test("says the run failed and on which flag, in the CLI's own spelling", () => {
    render(<App model={load()} />);

    expect(fact()).toBe("this run fails · --fail-on=high");
    expect(document.querySelector(".gate-fact")?.getAttribute("title")).toBe(
      "this run fails · --fail-on=high",
    );
    expect(screen.queryByRole("button", { name: /gate/ })).toBeNull();
  });

  test("writes a cause it has no words for as written, beside the known ones", () => {
    const model = load("composite", ({ report }) => {
      report.gate.tripped_by = ["fail_on", "licence_policy"] as never;
    });

    render(<App model={model} />);

    expect(fact()).toBe("this run fails · --fail-on=high · licence_policy");
  });

  test("says a run that only --strict-network failed fails by that flag, which the summary then repeats", () => {
    const model = load("composite", ({ report }) => {
      report.gate.tripped_by = ["strict_network"];
      report.gate.failing = 0;
    });

    render(<App model={model} />);

    expect(fact()).toBe("this run fails · --strict-network");
    expect(document.querySelector(".gate-fact")?.hasAttribute("data-said")).toBe(true);
  });

  test("says a baseline run that nothing failed passes, and applied no fail-on", () => {
    const model = load("composite", ({ report }) => {
      report.run.mode = "generate_baseline";
      report.gate.fails = false;
      report.gate.fail_on_applied = false;
      report.gate.tripped_by = [];
    });

    render(<App model={model} />);

    expect(fact()).toBe("baseline run passes · --fail-on not applied");
  });

  test("for a run told --fail-on=none draws a quiet 'no gate' button with its popover text, and no verdict", () => {
    render(<App model={load("B-gate-none")} />);

    const button = screen.getByRole("button", { name: /^no gate/ });
    expect(fact()).toBeNull();
    expect(button.getAttribute("title")).toContain(
      "This run was told --fail-on=none: it fails on no finding",
    );
  });
});
