import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

function composite(): Model {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function surface(name: string): Element | null {
  return document.querySelector(`[data-surface="${name}"]`);
}

function rowNames(): string[] {
  return [...document.querySelectorAll("[data-pkg]")].map((row) => row.getAttribute("data-pkg") ?? "");
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  history.replaceState(null, "", "/report.html#view=findings");
});
afterEach(() => {
  cleanup();
});

describe("a report-2 document routes every slot to its report-2 surface", () => {
  test("opens Overview on an empty fragment, with no row, no rail and no search box", () => {
    history.replaceState(null, "", "/report.html");
    render(<App model={composite()} />);

    expect(surface("overview")).not.toBeNull();
    expect(surface("findings")).toBeNull();
    expect(rowNames()).toEqual([]);
    expect(screen.queryByRole("group", { name: "Filters" })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Overview");
  });

  test("shows the Findings surface under its one-line strip, in rank order, with no newer-schema banner", () => {
    render(<App model={composite()} />);

    expect(document.querySelector(".schema-banner")).toBeNull();
    expect(surface("overview")).toBeNull();
    expect(document.querySelector(".f2-strip")?.textContent).toBe("9 flaggedcritical 4high 2low 3Overview ›");
    expect(surface("findings")).not.toBeNull();
    expect(rowNames()).toEqual([
      "twig/twig",
      "symfony/monolog-bridge",
      "guzzlehttp/guzzle",
      "symfony/debug",
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
      "friendsofsymfony/oauth2-php",
    ]);
  });

  test("draws a Findings row with the score, the package and the reach word", () => {
    render(<App model={composite()} />);

    const idn = screen.getByRole("row", { name: "symfony/polyfill-intl-idn" });
    expect(idn.querySelector(".f2-num")?.textContent).toBe("2");
    expect(idn.querySelector(".f2-pkg")?.textContent).toBe("symfony/polyfill-intl-idn v1.37.0");
    expect(idn.querySelector(".f2-reach")?.textContent).toBe("Reached via guzzlehttp/guzzle");
  });

  test("counts the graded findings on the Findings tab and the flags in the rail", () => {
    render(<App model={composite()} />);

    expect(screen.getByRole("tab", { name: "Findings 9" })).toBeTruthy();
    const rail = screen.getByRole("group", { name: "Filters" });
    expect(within(rail).getByRole("button", { name: "old-promise 3" })).toBeTruthy();
    expect(within(rail).getByRole("button", { name: "not in composer.json 2" })).toBeTruthy();
  });

  test("filters the list from the rail and the search box", () => {
    render(<App model={composite()} />);

    fireEvent.click(screen.getByRole("button", { name: "stale 3" }));
    expect(rowNames()).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "friendsofsymfony/oauth2-php",
    ]);
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "lead:pinned" } });
    expect(rowNames()).toEqual(["friendsofsymfony/oauth-server-bundle"]);
    expect(screen.getByRole("status").textContent).toContain("1 of 9 flagged package");
  });

  test("opens the report-2 detail sheet for a clicked row", () => {
    render(<App model={composite()} />);

    fireEvent.click(screen.getByRole("row", { name: "symfony/debug" }));
    const sheet = screen.getByRole("complementary", { name: "symfony/debug" });
    expect(sheet.getAttribute("data-surface")).toBe("detail");
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  test.each([
    ["All packages", "packages"],
    ["Advisories", "advisories"],
    ["Blast radius", "radius"],
    ["Run data", "run"],
  ])("routes the %s tab to its report-2 surface", (label, name) => {
    render(<App model={composite()} />);

    fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${label}`) }));
    expect(surface(name)).not.toBeNull();
  });

  test("opens an old prio= fragment as a verdict filter", () => {
    history.replaceState(null, "", "/report.html#prio=low");
    render(<App model={composite()} />);

    expect(rowNames()).toEqual(["symfony/yaml", "symfony/polyfill-intl-idn", "friendsofsymfony/oauth2-php"]);
    expect(screen.getByRole("button", { name: "Remove filter: Verdict low" })).toBeTruthy();
  });
});
