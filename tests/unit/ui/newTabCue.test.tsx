// Every link that opens a new tab says so in its name, with the words the detail header uses.
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { newTab } from "../../../src/domain/rich";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { ErrorScreen } from "../../../src/ui/ErrorScreen";
import { Report1Screen } from "../../../src/ui/Report1Screen";

afterEach(cleanup);

const CUE = newTab("");

function model(name: string): Model {
  const result = normalize(assembleEmbed(name));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** The new-tab links whose accessible name lacks the cue, closed dialogs and folds included. */
function uncued(): string[] {
  const cued = new Set(screen.queryAllByRole("link", { hidden: true, name: (name) => name.endsWith(CUE) }));
  return [...document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')]
    .filter((link) => !cued.has(link))
    .map((link) => `${link.textContent} -> ${link.href}`);
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe("the new-tab cue", () => {
  const composite = model("composite");

  test.each(["overview", "findings", "packages", "advisories", "radius", "run"])(
    "every new-tab link of the %s view, the header, the footer and the glossary carries it",
    (view) => {
      history.replaceState(null, "", `/report.html#view=${view}`);
      render(<App model={composite} />);

      expect(document.querySelectorAll('a[target="_blank"]').length).toBeGreaterThan(0);
      expect(uncued()).toEqual([]);
    },
  );

  test.each(composite.report.findings.map((f) => f.package))(
    "every new-tab link of the %s detail carries it",
    (pkg) => {
      history.replaceState(null, "", `/report.html#view=findings&pkg=${encodeURIComponent(pkg)}`);
      render(<App model={composite} />);

      expect(uncued()).toEqual([]);
    },
  );

  test("the screens' links carry it", () => {
    render(
      <>
        <Report1Screen version="0.13.0" />
        <ErrorScreen error={{ kind: "malformed-report", message: "It leaves out rot_depth." }} />
      </>,
    );

    expect(document.querySelectorAll('a[target="_blank"]').length).toBeGreaterThan(1);
    expect(uncued()).toEqual([]);
  });
});
