import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import { ErrorScreen } from "../../../src/ui/ErrorScreen";
import { RenderGuard } from "../../../src/ui/RenderGuard";
import { Report1Screen } from "../../../src/ui/Report1Screen";

afterEach(() => {
  cleanup();
});

describe("Report1Screen (PD-SCHEMA-1)", () => {
  // The one report-1 bundle the page keeps, as this screen's input only.
  const bundle = JSON.parse(readFileSync("fixtures/bundles/mini.json", "utf8")) as {
    report: { lockrot: { version: string; schema?: number } };
  };

  test("says the page reads lockrot 0.14 reports only and names the document's lockrot", () => {
    render(<Report1Screen version={bundle.report.lockrot.version} />);

    expect(screen.getByRole("heading", { name: "This page reads lockrot 0.14 reports only" })).toBeTruthy();
    expect(document.querySelector(".schema-banner")?.textContent).toContain(
      "This report is older than this page.",
    );
    expect(screen.getByRole("main").textContent).toContain(`lockrot ${bundle.report.lockrot.version}`);
  });

  test("offers the rerun commands and the lockrot-report 0.13.0 release as the two ways out", () => {
    render(<Report1Screen version={bundle.report.lockrot.version} />);

    const rerun = screen.getByRole("region", { name: "Rerun lockrot 0.14" });
    expect(within(rerun).getByText("composer require --dev somework/lockrot").tagName).toBe("CODE");
    expect(within(rerun).getByText("composer lockrot --format=html > report.html").tagName).toBe("CODE");
    expect(rerun.querySelector("pre")?.textContent).toContain("--format=html");
    const older = screen.getByRole("region", { name: "Open it with lockrot-report 0.13" });
    expect(within(older).getByRole("link").getAttribute("href")).toBe(
      "https://github.com/somework/lockrot-report/releases/tag/v0.13.0",
    );
  });

  test("names no version when the document states none", () => {
    render(<Report1Screen version={null} />);

    expect(screen.getByRole("main").textContent).toContain("an older lockrot");
  });
});

describe("ErrorScreen", () => {
  test("shares the screen frame: the brand row, then the explanation", () => {
    render(<ErrorScreen error={{ kind: "malformed-report", message: "It leaves out rot_depth." }} />);

    expect(screen.getByRole("banner").textContent).toContain("lockrot");
    expect(screen.getByRole("heading", { name: "This report could not be rendered" })).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("It leaves out rot_depth.");
  });
});

describe("RenderGuard", () => {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    history.replaceState(null, "", "/report.html");
  });

  test("renders the report when nothing throws", () => {
    const result = normalize(assembleEmbed("composite"));
    if (!result.ok) throw new Error(result.error.message);

    render(<RenderGuard model={result.model} />);

    expect(document.querySelector('[data-surface="overview"]')).not.toBeNull();
  });

  test("renders the error screen when the report throws while it renders", () => {
    const embed = assembleEmbed("composite");
    const result = normalize({ ...embed, report: { ...embed.report, findings: "not a list" } });
    if (!result.ok) throw new Error(result.error.message);

    render(<RenderGuard model={result.model} />);

    expect(screen.getByRole("heading", { name: "This report could not be rendered" })).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("broke while the page drew it");
  });
});
