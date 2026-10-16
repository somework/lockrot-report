import { cleanup, fireEvent, render, within } from "@testing-library/preact";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2Embed } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

const golden = (stringClass: string, name: string): unknown =>
  (
    JSON.parse(readFileSync(join(process.cwd(), "goldens", "en", `${stringClass}.json`), "utf8")) as Record<
      string,
      unknown
    >
  )[name];

const B = "symfony/monolog-bridge";

function modelOf(embed: Report2Embed): Model {
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function openCase(name: string, edit: (embed: Report2Embed) => Report2Embed = (e) => e): HTMLElement {
  const embed = edit(assembleEmbed(name));
  const pkg = embed.report.findings[0]?.package ?? "";
  history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent(pkg)}`);
  render(<App model={modelOf(embed)} />);
  const sheet = document.querySelector<HTMLElement>('[data-surface="detail"]');
  if (sheet === null) throw new Error("no detail sheet");
  return sheet;
}

const visibleText = (items: readonly Element[]): string[] =>
  items.filter((item) => !(item as HTMLElement).hidden).map((item) => item.textContent);

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1181"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the sheet in SPEC §7.9.8's order", () => {
  test("B: header, as-of line, answer, copy, Why, the rows, then the folded references", () => {
    const sheet = openCase("B");

    const headings = [...sheet.querySelectorAll("h2, h3")].map((h) => h.textContent);
    expect(headings).toEqual([
      B,
      "Why critical",
      "Checks",
      "Security",
      "Advisory feeds",
      "Release branches",
      "Age",
      "Repository",
      "The lock entry",
      "Provenance",
    ]);
    expect(sheet.querySelector(".d2-asof")?.textContent).toBe("Ages as of 2026-10-01");
    expect(sheet.querySelector(".d2-answer")?.textContent).toBe(golden("answer", "B"));
    expect(sheet.querySelector(".d2-reach")?.textContent).toBe("direct requirement");
    expect(sheet.querySelector(".pill")?.textContent).toBe("critical");
    expect([...sheet.querySelectorAll(".d2-pills .fp")].map((p) => p.textContent)).toEqual([
      "left-behind·6.9 y",
      "old-promise·PHP 5",
      "vulnerable·1",
    ]);
    expect(sheet.querySelectorAll("details.detail-reference:not([open])")).toHaveLength(2);
  });

  test("each row prints its golden line", () => {
    const sheet = openCase("B");
    const rowText = (label: string): string[] => {
      const row = [...sheet.querySelectorAll(".d2-row")].find(
        (r) => r.querySelector("h3")?.textContent === label,
      );
      return [...(row?.querySelectorAll(":scope .d2-row-value > p") ?? [])].map((p) => p.textContent);
    };

    expect(rowText("Checks")).toEqual([golden("checks", "B")]);
    expect(rowText("Advisory feeds")).toEqual([golden("feeds", "B")]);
    expect(rowText("Age")).toEqual([(golden("age", "B") as { line: string }).line]);
    expect(rowText("Repository")).toEqual([golden("repository", "B")]);
  });

  test("Release branches is a section across the sheet, its golden line under the eyebrow", () => {
    const sheet = openCase("B");
    const section = within(sheet).getByRole("region", { name: "Release branches" });

    expect(section.closest(".d2-row")).toBeNull();
    expect([...section.querySelectorAll(":scope > p")].map((p) => p.textContent)).toEqual([
      golden("branches", "B"),
    ]);
    expect(within(section).getByRole("table")).toBeTruthy();
  });

  test("a baselined finding adds the Baseline row with its suffix", () => {
    const sheet = openCase("B-baselined-dagger");

    expect([...sheet.querySelectorAll(".d2-row h3")].map((h) => h.textContent)).toContain("Baseline");
  });
});

describe("the header out-links", () => {
  const withLink =
    (link: string | null) =>
    (embed: Report2Embed): Report2Embed => {
      const entry = embed.details[B];
      if (entry === undefined) throw new Error(`no details for ${B}`);
      return { ...embed, details: { [B]: { ...entry, repository_link: link } } };
    };

  test("follow the reach text: the repository by host, then the registry, each in a new tab", () => {
    const sheet = openCase("B", withLink("https://www.github.com/symfony/monolog-bridge"));
    const meta = sheet.querySelector(".d2-meta");

    expect(meta?.textContent).toBe("direct requirement · github.com ↗ · packagist.org ↗");
    const links = within(sheet.querySelector<HTMLElement>(".d2-meta") ?? sheet).getAllByRole("link");
    expect(links.map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")])).toEqual([
      ["github.com repository, opens in a new tab", "https://www.github.com/symfony/monolog-bridge"],
      [
        "packagist.org page of this package, opens in a new tab",
        "https://packagist.org/packages/symfony/monolog-bridge",
      ],
    ]);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  test("leave out a refused repository URL and keep the registry", () => {
    const sheet = openCase("B", withLink("javascript:alert(1)"));

    expect(sheet.querySelector(".d2-meta")?.textContent).toBe("direct requirement · packagist.org ↗");
  });

  test("leave the reach text alone when no URL is published", () => {
    const sheet = openCase("B", (embed) => {
      const report = structuredClone(embed.report);
      const [first] = report.findings;
      if (first !== undefined) first.origin.package_url = null;
      return { ...embed, report };
    });

    expect(sheet.querySelector(".d2-meta")?.textContent).toBe("direct requirement");
    expect(sheet.querySelectorAll(".d2-meta a")).toHaveLength(0);
  });
});

describe("the Why block of design 2A", () => {
  test("shows the header, the opening and the after-the-move line at once", () => {
    const sheet = openCase("B");
    const why = sheet.querySelector(".d2-why") as HTMLElement;
    const lines = golden("why", "B") as string[];

    expect(why.querySelector(".d2-why-header")?.textContent).toBe(lines[0]);
    expect(visibleText([...why.querySelectorAll("li")])).toEqual([
      "maintenance (left-behind, 1 corroborating) alone grades it high, the advisory alone grades it high: together critical",
      "after the move: 0, ok (if Composer resolves it)",
    ]);
  });

  test("opens every golden line in its order on click", () => {
    const sheet = openCase("B");
    const why = sheet.querySelector(".d2-why") as HTMLElement;

    fireEvent.click(within(why).getByRole("button", { name: "Show the arithmetic" }));

    expect(visibleText([...why.querySelectorAll("li")])).toEqual((golden("why", "B") as string[]).slice(1));
  });

  test("draws the bar aria-hidden, one segment per term, its legend printing contribution", () => {
    const sheet = openCase("B");
    const figure = sheet.querySelector(".d2-why-figure") as HTMLElement;

    expect(figure.getAttribute("aria-hidden")).toBe("true");
    expect(sheet.querySelector(".d2-why > p.vh")?.textContent).toBe(
      "left-behind 16, old-promise 4, vulnerable 16",
    );
    expect([...figure.querySelectorAll(".d2-why-bar .sbar-seg")].map((s) => s.className)).toEqual([
      "sbar-seg is-lead tone-high",
      "sbar-seg is-corroborating tone-high",
      "sbar-seg is-security tone-high",
    ]);
    expect([...figure.querySelectorAll(".d2-why-legend-item")].map((i) => i.textContent)).toEqual([
      "left-behind 16",
      "old-promise 4",
      "vulnerable 16",
    ]);
  });

  test("a score-0 finding shows every line and no bar or arithmetic button", () => {
    const sheet = openCase("stale-accepted-dagger");
    const why = sheet.querySelector(".d2-why") as HTMLElement;

    expect(why.querySelector(".d2-why-figure")).toBeNull();
    expect(within(why).queryByRole("button", { name: "Show the arithmetic" })).toBeNull();
    expect(visibleText([...why.querySelectorAll("li")])).toEqual(
      (golden("why", "stale-accepted-dagger") as string[]).slice(1),
    );
  });
});

describe("the Security row of design 5A", () => {
  test("shows the summary and the first rung, and the others on click, each its golden clause", () => {
    const sheet = openCase("B");
    const row = [...sheet.querySelectorAll(".d2-row")].find(
      (r) => r.querySelector("h3")?.textContent === "Security",
    );
    const rungs = (): string[] => visibleText([...(row?.querySelectorAll(".d2-rung") ?? [])]);
    const security = golden("security", "B") as string;
    const summary = "1 high advisory · 1 on record for this name · fix: upgrade · lookup complete";

    expect(security.startsWith(`${summary} · `)).toBe(true);
    expect(row?.querySelector(".d2-row-text")?.textContent).toBe(summary);
    expect(rungs()).toEqual([
      "5.x clears 1 of 1 from v5.4.52 (upgrade; held by composer.json; after it: 0, ok, if Composer resolves it)",
    ]);
    expect(row?.querySelector(".d2-rung.is-move")?.getAttribute("data-branch")).toBe("5.x");

    fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "3 more ways out: 6.x, 7.x and 8.x (php floor raise)",
      }),
    );

    expect([summary, ...rungs()].join(" · ")).toBe(security);
  });
});

describe("the copy control of design 5C", () => {
  const commandText = (sheet: HTMLElement): string[] =>
    [...sheet.querySelectorAll(".d2-copy-line")].map((line) => line.textContent);

  test("prints the POSIX line first, and the menu switches the shell and keeps the choice", () => {
    const sheet = openCase("B");

    expect(commandText(sheet)).toEqual(["composer require 'symfony/monolog-bridge:^5.4.52'"]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Shell: POSIX" }));
    const menu = within(sheet).getByRole("menu", { name: "Shell" });
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.getAttribute("aria-checked")),
    ).toEqual(["true", "false", "false"]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /cmd\.exe/ }));

    expect(commandText(sheet)).toEqual(['composer require "symfony/monolog-bridge:^5.4.52"']);
    expect(window.localStorage.getItem("lockrot-shell")).toBe("cmd");
    expect(menu.hidden).toBe(true);
  });

  test("reads the saved shell on the next sheet", () => {
    window.localStorage.setItem("lockrot-shell", "powershell");

    const sheet = openCase("B");

    expect(commandText(sheet)).toEqual(['composer --% require "symfony/monolog-bridge:^5.4.52"']);
    expect(within(sheet).getByRole("button", { name: "Shell: PowerShell" })).toBeTruthy();
  });

  test("falls back to POSIX when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const sheet = openCase("B");

    expect(within(sheet).getByRole("button", { name: "Shell: POSIX" })).toBeTruthy();
  });

  test("Escape closes the menu and leaves the sheet open", () => {
    const sheet = openCase("B");
    fireEvent.click(within(sheet).getByRole("button", { name: "Shell: POSIX" }));
    const menu = within(sheet).getByRole("menu", { name: "Shell" });

    fireEvent.keyDown(within(menu).getAllByRole("menuitemradio")[0] as HTMLElement, { key: "Escape" });

    expect(menu.hidden).toBe(true);
    expect(document.querySelector('[data-surface="detail"]')).not.toBeNull();
  });

  test("an argv outside the argument rule prints the refusal and offers no copy", () => {
    const sheet = openCase("B", (embed) => {
      const [finding] = embed.report.findings;
      if (!finding?.next_step) throw new Error("B has a move");
      const next_step = { ...finding.next_step, commands: [["composer", "require", "a/b:%PATH%"]] };
      return { ...embed, report: { ...embed.report, findings: [{ ...finding, next_step }] } };
    });

    expect(commandText(sheet)).toEqual(["This command holds characters the page does not print."]);
    expect(within(sheet).queryByRole("button", { name: "Copy" })).toBeNull();
  });

  const withCommands =
    (commands: string[][]) =>
    (embed: Report2Embed): Report2Embed => {
      const [finding] = embed.report.findings;
      if (!finding?.next_step) throw new Error("the case has a move");
      const next_step = { ...finding.next_step, commands };
      return { ...embed, report: { ...embed.report, findings: [{ ...finding, next_step }] } };
    };

  test("one refused argv hides every step of the move on every shell, and the menu previews none", () => {
    const sheet = openCase(
      "B",
      withCommands([
        ["composer", "require", "php:>=8.1", "--no-update"],
        ["composer", "require", "a/b:%PATH%"],
      ]),
    );

    expect(commandText(sheet)).toEqual(["This command holds characters the page does not print."]);
    expect(within(sheet).queryByRole("button", { name: "Copy" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Shell: POSIX" }));
    const menu = within(sheet).getByRole("menu", { name: "Shell" });
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["POSIX", "cmd.exe", "PowerShell"]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "PowerShell" }));
    expect(commandText(sheet)).toEqual(["This command holds characters the page does not print."]);
  });

  test.each([
    ["an update", "E", "`composer update symfony/yaml` installs v5.4.53"],
    ["a require", "B", "Require ^5.4.52: it clears"],
  ])("%s move with an empty commands[] shows no copy control and keeps its words", (_, name, words) => {
    const sheet = openCase(name, withCommands([]));

    expect(sheet.querySelector(".d2-copy")).toBeNull();
    expect(sheet.textContent).toContain(words);
  });

  test("a move with no command draws no copy control", () => {
    const sheet = openCase("stale-accepted-dagger");

    expect(sheet.querySelector(".d2-copy")).toBeNull();
  });
});

describe("the Release branches timeline", () => {
  test("is described by the golden line and draws its rows and both guides", () => {
    const sheet = openCase("B");
    const table = within(sheet).getByRole("table");

    const described = document.getElementById(table.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(golden("branches", "B"));
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((h) => h.textContent),
    ).toEqual(["8.x, the newest", "5 between branches, between the newest and yours", "2.x, yours"]);
    expect(table.querySelectorAll(".detail-timeline-guide-cap")).toHaveLength(2);
  });

  test("draws no guide when the run has no thresholds", () => {
    const sheet = openCase("B", (embed) => ({
      ...embed,
      report: { ...embed.report, run: { ...embed.report.run, thresholds: null } },
    }));

    expect(
      within(sheet).getByRole("table").querySelectorAll(".detail-timeline-guide, .detail-timeline-guide-cap"),
    ).toHaveLength(0);
  });

  test("opens a fold on click", () => {
    const sheet = openCase("B");
    const table = within(sheet).getByRole("table");

    fireEvent.click(within(table).getByRole("button", { name: /5 between/ }));

    expect(within(table).getAllByRole("rowheader")).toHaveLength(8);
  });
});
