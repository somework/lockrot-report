import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

function model(edit: (report: Report2) => void = () => undefined): Model {
  const embed = assembleEmbed("composite");
  edit(embed.report);
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function band(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-surface="overview"]');
  if (found === null) throw new Error("no overview band");
  return found;
}

function viewport(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: phone ? query.includes("max-width: 759px") : query.includes("1181"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  viewport(false);
  history.replaceState(null, "", "/report.html");
});
afterEach(() => {
  cleanup();
});

describe("the overview band of a report-2 document", () => {
  test("leads with the flagged figure, the grade chips and gate.text as written", () => {
    render(<App model={model()} />);

    const lead = within(band());
    expect(band().querySelector(".lead-num")?.textContent).toBe("7");
    expect(lead.getByRole("button", { name: "critical 3" })).toBeTruthy();
    expect(lead.getByRole("button", { name: "medium 0" })).toBeTruthy();
    expect(
      lead.getByText("gate: fails · --fail-on=high · 5 findings fail it · target php 8.4 (--target-php)"),
    ).toBeTruthy();
  });

  test("draws one flag bar per carried flag, each with its split by grade", () => {
    render(<App model={model()} />);

    const bars = [...band().querySelectorAll(".overview2-flag-bars > button")].map((bar) => bar.textContent);
    expect(bars).toEqual([
      "abandoned 1 graded critical 1",
      "pinned 1 graded high 1",
      "left-behind 1 graded critical 1",
      "old-promise 3 graded critical 2 · high 1",
      "stale 2 graded high 2",
      "vulnerable 4 graded critical 2 · low 2",
    ]);
  });

  test("labels the severity chips apart from the grade chips", () => {
    render(<App model={model()} />);

    const severities = within(band()).getByRole("group", { name: "Advisories by severity" });
    expect(within(severities).getByRole("button", { name: "critical 1" })).toBeTruthy();
    expect(within(band()).getByRole("group", { name: "Grade" })).toBeTruthy();
  });

  test.each([
    ["Grade", "critical 3", "verdict=critical"],
    ["Advisories by severity", "unrated 2", "sev=unrated"],
  ])("a chip in %s toggles its filter", (group, name, fragment) => {
    render(<App model={model()} />);

    const chip = within(within(band()).getByRole("group", { name: group })).getByRole("button", { name });
    fireEvent.click(chip);

    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(location.hash).toContain(fragment);
  });

  test("a flag bar toggles the flag filter", () => {
    render(<App model={model()} />);

    const bar = within(band()).getByRole("button", { name: /^stale 2/ });
    fireEvent.click(bar);

    expect(bar.getAttribute("aria-pressed")).toBe("true");
    expect(location.hash).toContain("flag=stale");
  });

  test("states the depth sentence, the accepted line and the Libyears panel", () => {
    render(<App model={model()} />);

    const text = band().textContent;
    expect(text).toContain("4 carry more than one flag · score model 1");
    expect(text).toContain("1 of 7 flagged packages is named by no line of composer.json");
    expect(text).toContain("Accepted by the allowlist: none in flagged packages");
    expect(text).toContain(
      "17.85 libyears over 5 packages · 17.85 from direct requirements · furthest behind: symfony/monolog-bridge v2.6.13, 10.62 · 1 not measured (a branch snapshot has no release branch) · 1 not measured (no date)",
    );
  });

  test("says nothing is flagged and draws no flag bar", () => {
    render(
      <App
        model={model((report) => {
          report.packages_flagged = 0;
          report.rot_depth = { ...report.rot_depth, flagged: 0 };
          for (const flag of Object.values(report.flags)) flag.carrying = 0;
        })}
      />,
    );

    expect(band().textContent).toContain("Nothing flagged in 7 packages");
    expect(band().querySelector(".overview2-flag-bars")).toBeNull();
    expect(band().querySelector(".ledger-verdicts")).toBeNull();
    expect(band().textContent).not.toContain("Accepted by the allowlist");
  });

  test("an empty lock has no chips, no waffle and no tier", () => {
    render(
      <App
        model={model((report) => {
          report.packages_checked = 0;
          report.packages_flagged = 0;
        })}
      />,
    );

    expect(band().textContent).toContain("No packages in this lock");
    expect(within(band()).queryAllByRole("button")).toEqual([]);
    expect(band().querySelector(".waffle")).toBeNull();
    expect(band().querySelector(".ledger-tier")).toBeNull();
  });

  test("folds the tier on a phone behind a peek of what it holds", () => {
    viewport(true);
    render(<App model={model()} />);

    const fold = band().querySelector("details.ledger-fold");
    expect(fold?.querySelector("summary")?.textContent).toBe(
      "More about this lock6 flags · 20 advisories · 17.9 libyears",
    );
  });

  test("is hidden on the Run tab", () => {
    history.replaceState(null, "", "/report.html#view=run");
    render(<App model={model()} />);

    expect(document.querySelector('[data-surface="overview"]')).toBeNull();
  });
});

describe("the header's Copy summary on a report-2 document", () => {
  test("copies the three lines of SPEC §7.9.15", async () => {
    // Arrange
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<App model={model()} />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    // Assert
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });
    expect(writeText).toHaveBeenCalledWith(
      [
        "lockrot report · data as of 2026-10-01 · lockrot 0.14.0 · score model 1 · target PHP 8.4",
        "7 of 7 packages flagged (100%): 3 graded critical, 2 high, 2 low. Flags: abandoned 1, pinned 1, left-behind 1, old-promise 3, stale 2, vulnerable 4.",
        "All 7 in production · 6 required directly, 1 pulled in · 20 security advisories on 4 packages (severity: 1 critical, 4 high, 4 medium, 2 unrated, 9 low) · fix by package: 2 composer update, 1 upgrade, 1 php floor raise · 17.9 libyears behind.",
      ].join("\n"),
    );
  });
});

describe("the overview's Update now line", () => {
  test("prints security.update_now_command through the copy control, POSIX first", () => {
    render(<App model={model()} />);

    const line = band().querySelector<HTMLElement>(".overview2-update");
    expect(line).not.toBeNull();
    expect(within(line as HTMLElement).getByText("Update now")).toBeTruthy();
    expect(line?.querySelector(".d2-copy-cmd")?.textContent).toBe(
      "composer update symfony/yaml symfony/polyfill-intl-idn",
    );
    expect(within(line as HTMLElement).getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  test("a null command hides the line", () => {
    render(
      <App
        model={model((report) => {
          report.security.update_now_command = null;
        })}
      />,
    );
    expect(band().querySelector(".overview2-update")).toBeNull();
  });

  test("a command the argument rule refuses prints why and offers no copy", () => {
    render(
      <App
        model={model((report) => {
          report.security.update_now_command = ["composer", "update", "a/b;rm -rf"];
        })}
      />,
    );
    const line = band().querySelector<HTMLElement>(".overview2-update");
    expect(line?.querySelector(".d2-copy-cmd")?.textContent).toBe(
      "This command holds characters the page does not print.",
    );
    expect(within(line as HTMLElement).queryByRole("button", { name: "Copy" })).toBeNull();
  });
});
