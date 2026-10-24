// L5 on the surfaces that print a command once per row: Ready to run and the Findings tab carry the
// config.platform.php line once, above the list.
import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { pageGoldens } from "../words/recorded";

const LINE = "First set config.platform.php to your PHP 8.4 release: the lock records 7.4.29.";

/** snipe-it, a page golden with moves ready to run, on a target of 8.4. */
function model(override: string | null): Model {
  const found = pageGoldens().find((entry) => entry.id === "snipe-it");
  if (found === undefined) throw new Error("no page golden snipe-it");
  const report = structuredClone(found.report);
  const { run } = report;
  if (run.php_window === null) throw new Error("snipe-it has a PHP window");
  run.target_php = "8.4";
  run.php_window = { ...run.php_window, platform_override: override };
  const result = normalize(report);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function surface(view: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-surface="${view}"]`);
  if (found === null) throw new Error(`no ${view} surface`);
  return found;
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
});

describe("Ready to run on a lock whose config.platform.php lies outside the target (wallabag at 8.4)", () => {
  test("prints the platform line once, above the list", () => {
    history.replaceState(null, "", "/report.html");
    render(<App model={model("7.4.29")} />);

    const lines = [...surface("overview").querySelectorAll(".ov-first .ov-platform")];
    expect(lines.map((line) => line.textContent)).toEqual([LINE]);
    expect(lines[0]?.nextElementSibling?.classList.contains("ov-moves")).toBe(true);
  });

  test("prints no platform line when the lock sets none", () => {
    history.replaceState(null, "", "/report.html");
    render(<App model={model(null)} />);

    expect(surface("overview").querySelector(".ov-platform")).toBeNull();
  });
});

describe("the Findings tab on a lock whose config.platform.php lies outside the target", () => {
  test("prints the platform line once, above the table", () => {
    history.replaceState(null, "", "/report.html#view=findings");
    render(<App model={model("7.4.29")} />);

    const lines = [...surface("findings").querySelectorAll(".f2-platform")];
    expect(lines.map((line) => line.textContent)).toEqual([LINE]);
    expect(lines[0]?.nextElementSibling?.getAttribute("aria-label")).toBe("Findings");
  });

  test("prints no platform line when it lies inside the target's minor", () => {
    history.replaceState(null, "", "/report.html#view=findings");
    render(<App model={model("8.4.1")} />);

    expect(surface("findings").querySelector(".f2-platform")).toBeNull();
  });
});
