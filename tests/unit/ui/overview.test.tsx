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

describe("the Overview tab of a report-2 document", () => {
  test("leads with the flagged figure, the grade chips and gate.text as written", () => {
    render(<App model={model()} />);

    const lead = within(band());
    expect(band().querySelector(".lead-num")?.textContent).toBe("7");
    expect(lead.getByRole("link", { name: "critical 3" })).toBeTruthy();
    expect(lead.getByRole("link", { name: "medium 0" })).toBeTruthy();
    expect(
      lead.getByText("gate: fails · --fail-on=high · 5 findings fail it · target php 8.4 (--target-php)"),
    ).toBeTruthy();
  });

  test("draws one flag bar per carried flag, each with its split by grade", () => {
    render(<App model={model()} />);

    const bars = [...band().querySelectorAll(".overview2-flag-bars > a")].map((bar) => bar.textContent);
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
    expect(within(severities).getByRole("link", { name: "critical 1" })).toBeTruthy();
    expect(within(band()).getByRole("group", { name: "Grade" })).toBeTruthy();
  });

  test.each([
    ["Grade", "critical 3", "#view=findings&verdict=critical", "Findings 7"],
    ["Advisories by severity", "unrated 2", "#view=advisories&sev=unrated", "Advisories 20"],
  ])("a chip in %s links to its list, and a click opens it in place", (group, name, fragment, tab) => {
    render(<App model={model()} />);

    const chip = within(within(band()).getByRole("group", { name: group })).getByRole("link", { name });
    expect(chip.getAttribute("href")).toBe(fragment);
    fireEvent.click(chip);

    expect(location.hash).toBe(fragment);
    expect(screen.getByRole("tab", { selected: true }).getAttribute("aria-label")).toBe(tab);
    expect(document.activeElement).toBe(document.querySelector(".shell-main"));
  });

  test("a flag bar links to Findings under its flag", () => {
    render(<App model={model()} />);

    const bar = within(band()).getByRole("link", { name: /^stale 2/ });
    expect(bar.getAttribute("href")).toBe("#view=findings&flag=stale");
    fireEvent.click(bar);

    expect(location.hash).toBe("#view=findings&flag=stale");
    expect([...document.querySelectorAll("[data-pkg]")].map((row) => row.getAttribute("data-pkg"))).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
    ]);
  });

  test("a click with a modifier is left to the browser", () => {
    render(<App model={model()} />);

    const bar = within(band()).getByRole("link", { name: /^stale 2/ });
    fireEvent.click(bar, { ctrlKey: true });

    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Overview");
  });

  test("links each fix count of the Security block to Findings under that fix", () => {
    render(<App model={model()} />);

    expect(within(band()).getByRole("link", { name: "composer update 2" }).getAttribute("href")).toBe(
      "#view=findings&fix=update",
    );
  });

  test("names each score stack by its grades and links it to the search at its total", () => {
    render(<App model={model()} />);

    const stacks = within(within(band()).getByRole("list", { name: "Scores" })).getAllByRole("link");
    expect(stacks.map((stack) => [stack.getAttribute("aria-label"), stack.getAttribute("href")])).toEqual([
      ["score 36: 2 critical", "#view=findings&q=score%3A%3E%3D36"],
      ["score 32: 1 critical", "#view=findings&q=score%3A%3E%3D32"],
      ["score 18: 2 high", "#view=findings&q=score%3A%3E%3D18"],
      ["score 2: 2 low", "#view=findings&q=score%3A%3E%3D2"],
    ]);
    expect(band().querySelector(".ss-rule")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("draws the exposure rows as links to Blast radius", () => {
    render(<App model={model()} />);

    const row = within(band()).getByRole("link", { name: "guzzlehttp/guzzle 1" });
    expect(row.getAttribute("href")).toBe("#view=radius");
  });

  test("tables the packages furthest behind, each linked to its row", () => {
    render(<App model={model()} />);

    const table = within(band()).getByRole("table", { name: "Furthest behind, top 8" });
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual([
      "symfony/monolog-bridge v2.6.1310.6critical",
      "symfony/yaml v5.4.233.4low",
      "twig/twig v2.16.12.0critical",
      "symfony/debug v3.4.471.8critical",
      "tubalmartin/cssmin v4.1.10.0high",
    ]);
    fireEvent.click(within(table).getByRole("link", { name: "symfony/yaml" }));

    expect(location.hash).toBe("#view=findings&pkg=symfony%2Fyaml");
    expect(document.querySelector(".shell-detail")).not.toBeNull();
  });

  test("lays its parts out in reading order: lead, flags, Security, scores, exposure, Libyears", () => {
    render(<App model={model()} />);

    expect([...band().children].map((part) => part.className)).toEqual([
      "ov-lead",
      "ov-flags",
      "ov-security",
      "ov-score",
      "ov-expo",
      "ov-libyears",
    ]);
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
    expect(within(band()).queryAllByRole("link")).toEqual([]);
    expect(band().querySelector(".waffle")).toBeNull();
    expect(band().querySelector(".ov-security")).toBeNull();
  });

  test.each([false, true])("folds nothing (phone: %s)", (phone) => {
    viewport(phone);
    render(<App model={model()} />);

    expect(band().querySelector("details")).toBeNull();
    expect(band().querySelector(".overview2-flag-bars")).not.toBeNull();
  });

  test.each(["findings", "advisories", "packages", "radius", "run"])("is left out of the %s tab", (view) => {
    history.replaceState(null, "", `/report.html#view=${view}`);
    render(<App model={model()} />);

    expect(document.querySelector('[data-surface="overview"]')).toBeNull();
  });
});

describe("the tabs that lead without the band", () => {
  function surface(name: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(`[data-surface="${name}"]`);
    if (found === null) throw new Error(`no ${name} surface`);
    return found;
  }

  test("Advisories leads with the Security block, its answer counted once, and Update now", () => {
    history.replaceState(null, "", "/report.html#view=advisories");
    render(<App model={model()} />);

    const advisories = surface("advisories");
    const lead = advisories.querySelector<HTMLElement>(".al-lead");
    expect(lead).not.toBeNull();
    expect(lead?.querySelector(".al-answer")?.textContent).toBe("20 advisories on 4 packages.");
    expect(advisories.textContent.match(/20 advisories/g)).toHaveLength(1);
    expect(advisories.textContent).not.toContain("by severity:");
    const chips = within(within(lead as HTMLElement).getByRole("group", { name: "Advisories by severity" }));
    expect(chips.getByRole("button", { name: "critical 1" })).toBeTruthy();
    expect(lead?.querySelector(".overview2-update .d2-copy-cmd")?.textContent).toBe(
      "composer update symfony/yaml symfony/polyfill-intl-idn",
    );
    expect(lead?.compareDocumentPosition(advisories.querySelector("li[data-pkg]") as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("Advisories under a filter keeps the matching advisories' severities, which the chips do not count", () => {
    history.replaceState(null, "", "/report.html#view=advisories&fix=upgrade");
    render(<App model={model()} />);

    const lead = surface("advisories").querySelector<HTMLElement>(".al-lead");
    expect(lead?.querySelector(".al-answer")?.textContent).toBe(
      "1 matching advisory on 1 package, by severity: 1 high.",
    );
    expect(lead?.textContent).toContain("without it there are 20.");
    expect(lead?.querySelector(".ledger-fig")).toBeNull();
  });

  test("Advisories keeps the lookup hedge beside its answer", () => {
    history.replaceState(null, "", "/report.html#view=advisories");
    render(
      <App
        model={model((report) => {
          report.security.check = "partial";
        })}
      />,
    );

    const lead = surface("advisories").querySelector<HTMLElement>(".al-lead");
    expect(lead?.querySelector(".al-partial")?.textContent).toContain("so this list may be partial.");
    expect(lead?.textContent).not.toContain("advisory check incomplete, so the list may be partial");
  });

  test("Blast radius leads with the depth sentence", () => {
    history.replaceState(null, "", "/report.html#view=radius");
    render(<App model={model()} />);

    expect(surface("radius").firstElementChild?.textContent).toBe(
      "1 of 7 flagged packages is named by no line of composer.json; the deepest, symfony/polyfill-intl-idn, sits 1 hop from the nearest line.",
    );
  });

  test("All packages starts with its table", () => {
    history.replaceState(null, "", "/report.html#view=packages");
    render(<App model={model()} />);

    const main = document.querySelector<HTMLElement>(".shell-main");
    expect(main?.querySelector('[data-surface="packages"] table')).not.toBeNull();
    expect(document.querySelector("main")?.querySelector(".ledger-band")).toBeNull();
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

describe("the phone's Filters fold", () => {
  test("counts the Grade and Severity filters, which no band chip shows on this tab", () => {
    viewport(true);
    history.replaceState(null, "", "/report.html#view=packages&verdict=critical&sev=high");
    render(<App model={model()} />);

    expect(document.querySelector(".rail-fold > summary")?.textContent).toBe("Filters · 2 on");
  });
});
