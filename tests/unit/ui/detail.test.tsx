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
    matches: /1000px|1024px/.test(query),
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
  test("B: header, verdict, the move and its holders, Why, the rows, then the folded references", () => {
    const sheet = openCase("B");

    const headings = [...sheet.querySelectorAll("h2, h3")].map((h) => h.textContent);
    expect(headings).toEqual([
      B,
      "Verdict",
      "The move",
      "Held by",
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
    expect(sheet.querySelector(".d3-verdict-line")?.textContent).toBe(golden("verdict-line", "B"));
    expect(sheet.querySelector(".pill")?.textContent).toBe("critical");
    expect([...sheet.querySelectorAll(".d2-pills .fp")].map((p) => p.textContent)).toEqual([
      "left-behind·6.9 y",
      "old-promise·PHP 5",
      "vulnerable·1",
    ]);
    expect(sheet.querySelectorAll("details.detail-reference:not([open])")).toHaveLength(2);
  });

  test("has no answer paragraph and no copy button for one", () => {
    const sheet = openCase("B");

    expect(sheet.querySelector(".d2-answer, .d2-lead")).toBeNull();
    expect(within(sheet).getAllByRole("button", { name: "Copy" })).toHaveLength(1);
  });

  test("each row prints its golden lines", () => {
    const sheet = openCase("B");
    const row = (label: string): Element | undefined =>
      [...sheet.querySelectorAll(".d2-row")].find((r) => r.querySelector("h3")?.textContent === label);

    expect([...(row("Checks")?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(
      (golden("checks", "B") as string).split(" · "),
    );
    expect(row("Advisory feeds")?.querySelector("p")?.textContent).toBe(golden("feeds", "B"));
    expect(
      [...(row("Age")?.querySelectorAll(".d3-kv > div") ?? [])].map((div) => ({
        label: div.querySelector("dt")?.textContent,
        value: div.querySelector("dd")?.textContent,
      })),
    ).toEqual(golden("age-rows", "B"));
    expect(row("Repository")?.querySelector("p")?.textContent).toBe(golden("repository", "B"));
  });

  test("Release branches is a section across the sheet, its golden lead under the eyebrow", () => {
    const sheet = openCase("B");
    const section = within(sheet).getByRole("region", { name: "Release branches" });

    expect(section.closest(".d2-row")).toBeNull();
    expect(section.querySelector(":scope > p")?.textContent).toBe(
      (golden("branches-lead", "B") as string[]).join(" "),
    );
    expect(within(section).getByRole("table", { name: "Release branches" })).toBeTruthy();
  });

  test("a baselined finding adds the Baseline row with its suffix", () => {
    const sheet = openCase("B-baselined-dagger");

    expect([...sheet.querySelectorAll(".d2-row h3")].map((h) => h.textContent)).toContain("Baseline");
  });
});

describe("the header", () => {
  const withLink =
    (link: string | null) =>
    (embed: Report2Embed): Report2Embed => {
      const entry = embed.details[B];
      if (entry === undefined) throw new Error(`no details for ${B}`);
      return { ...embed, details: { [B]: { ...entry, repository_link: link } } };
    };

  test("links the repository by host, then the registry, each in a new tab; the Reach row holds the reach", () => {
    const sheet = openCase("B", withLink("https://www.github.com/symfony/monolog-bridge"));
    const meta = sheet.querySelector(".d2-meta");

    expect(meta?.textContent).toBe("github.com ↗ · packagist.org ↗");
    const links = within(sheet.querySelector<HTMLElement>(".d2-meta") ?? sheet).getAllByRole("link");
    expect(links.map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")])).toEqual([
      ["github.com repository, opens in a new tab", "https://www.github.com/symfony/monolog-bridge"],
      [
        "packagist.org page of this package, opens in a new tab",
        "https://packagist.org/packages/symfony/monolog-bridge",
      ],
    ]);
    expect(links.map((a) => [a.getAttribute("target"), a.getAttribute("rel")])).toEqual([
      ["_blank", "noopener noreferrer"],
      ["_blank", "noopener noreferrer"],
    ]);
  });

  test("leaves out a refused repository URL and keeps the registry", () => {
    const sheet = openCase("B", withLink("javascript:alert(1)"));

    expect(sheet.querySelector(".d2-meta")?.textContent).toBe("packagist.org ↗");
  });

  test("a sheet with no flag names its reach in the header (G47), then the links", () => {
    const sheet = openCase("ok-unchecked");

    expect(sheet.querySelector(".d2-meta")?.textContent).toMatch(
      /^via \S+, \S+, \S+ and 1 more · packagist\.org ↗$/,
    );
    expect([...sheet.querySelectorAll(".d3-q > dt")].map((dt) => dt.textContent)).not.toContain("Reach");
  });
});

describe("the Why block of design 2A", () => {
  test("shows the header and the opening at once", () => {
    const sheet = openCase("B");
    const why = sheet.querySelector(".d2-why") as HTMLElement;
    const lines = golden("why", "B") as string[];

    expect(why.querySelector(".d2-why-header")?.textContent).toBe(lines[0]);
    expect(visibleText([...why.querySelectorAll("li")])).toEqual([
      "maintenance (left-behind, 1 corroborating) alone grades it high, the advisory alone grades it high: together critical",
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

describe("the Security row", () => {
  const securityRow = (sheet: HTMLElement): HTMLElement => {
    const row = [...sheet.querySelectorAll<HTMLElement>(".d2-row")].find(
      (r) => r.querySelector("h3")?.textContent === "Security",
    );
    if (row === undefined) throw new Error("no Security row");
    return row;
  };

  test("lists the golden summary, the advisory and every rung of the ladder", () => {
    const row = securityRow(openCase("B"));
    const security = golden("security", "B") as { summary: string[]; ladder: { lines: string[] }[] };

    expect(
      [...row.querySelectorAll(":scope .d2-row-value > .d3-lines > li")].map((li) => li.textContent),
    ).toEqual(security.summary);
    expect(row.querySelectorAll(".d3-adv")).toHaveLength(1);
    expect(within(row).getByRole("list", { name: "4 ways out" })).toBeTruthy();
    expect(
      [...row.querySelectorAll(".d2-rung")].map((rung) =>
        [...rung.querySelectorAll(":scope > div")].map((line) => line.textContent),
      ),
    ).toEqual(security.ladder.map((rung) => rung.lines));
    expect(row.querySelector(".d2-rung.is-move")?.getAttribute("data-branch")).toBe("5.x");
  });

  test("folds a range string past RANGE_INLINE_MAX behind its count, and opens it by its button", () => {
    const row = securityRow(openCase("B"));
    const button = within(row).getByRole("button", { name: "19 ranges" });
    const ranges = document.getElementById(button.getAttribute("aria-controls") ?? "");
    const rows = golden("security", "B") as { rows: { ranges: string[] }[] };

    expect(ranges?.hidden).toBe(true);
    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(ranges?.hidden).toBe(false);
    expect([...(ranges?.children ?? [])].map((line) => line.textContent)).toEqual(rows.rows[0]?.ranges);
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
    ["an update", "E"],
    ["a require", "B"],
  ])("%s move with an empty commands[] shows no copy control and keeps its action", (_, name) => {
    const sheet = openCase(name, withCommands([]));
    const [move] = golden("moves", name) as { action: string }[];

    expect(sheet.querySelector(".d2-copy")).toBeNull();
    expect(sheet.querySelector(".d3-move-action")?.textContent).toBe(move?.action);
  });

  test("names one command by its eyebrow, and several as commands in order", () => {
    const one = openCase("B");
    expect(one.querySelector(".d2-copy-bar .eyebrow")?.textContent).toBe("Command");
    cleanup();

    const several = openCase(
      "B",
      withCommands([
        ["composer", "require", "php:>=8.1", "--no-update"],
        ["composer", "require", "symfony/monolog-bridge:^5.4.52"],
      ]),
    );
    expect(several.querySelector(".d2-copy-bar .eyebrow")?.textContent).toBe("Commands, in order");
  });

  test("a move with no command draws no copy control", () => {
    const sheet = openCase("stale-accepted-dagger");

    expect(sheet.querySelector(".d2-copy")).toBeNull();
  });
});

describe("the Release branches timeline", () => {
  test("is named by its heading, described by the lead, and draws its rows, marks and both guides", () => {
    const sheet = openCase("B");
    const table = within(sheet).getByRole("table", { name: "Release branches" });

    const described = document.getElementById(table.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe((golden("branches-lead", "B") as string[]).join(" "));
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((h) => h.textContent),
    ).toEqual([
      "8.x, the newest",
      "2 between the newest branch and yours",
      "7.x",
      "6.x",
      "5.x the move",
      "2 between the newest branch and yours",
      "4.x",
      "3.x",
      "2.x yours",
    ]);
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

  test("keeps a folded row in the table, and opens the fold on click", () => {
    const sheet = openCase("B");
    const table = within(sheet).getByRole("table");
    const [first] = within(table).getAllByRole("button", { name: /^2 between/ });
    const folded = (): string[] =>
      [...table.querySelectorAll(".is-collapsed")].map((row) => row.getAttribute("data-branch") ?? "");

    expect(folded()).toEqual(["7.x", "6.x", "4.x", "3.x"]);
    expect(table.querySelector("[aria-hidden='true'][role='row']")).toBeNull();
    fireEvent.click(first as HTMLElement);

    expect(first?.getAttribute("aria-expanded")).toBe("true");
    expect(folded()).toEqual(["4.x", "3.x"]);
  });
});
