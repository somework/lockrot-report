import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { pageGoldens } from "../words/recorded";

function model(edit: (report: Report2) => void = () => undefined): Model {
  const embed = assembleEmbed("composite");
  edit(embed.report);
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** An accessible name test that ignores the spaces a DOM shim puts around a package name's parts;
 *  Chromium names the link without them (captured aria trees). */
const named = (name: string) => (accessible: string) => accessible.replace(/\/\s+/g, "/") === name;

function band(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-surface="overview"]');
  if (found === null) throw new Error("no overview band");
  return found;
}

function viewport(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: phone ? query.includes("max-width: 759px") : /1000px|1024px/.test(query),
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
  test("leads with the grade line, the figure line, the grade chips and gate.text as written", () => {
    render(<App model={model()} />);

    const lead = within(band());
    expect(band().querySelector(".ov-grade")?.textContent).toBe(
      "Project grade: critical · 4 critical findings · 6 of 9 packages high or worse",
    );
    expect(band().querySelector(".ov-figure")?.textContent).toBe(
      "9 of 9 packages flagged · 0 ok · 0 finished",
    );
    expect(lead.getByRole("link", { name: "critical 4" })).toBeTruthy();
    expect(lead.queryByRole("link", { name: "medium 0" })).toBeNull();
    expect(band().querySelector(".overview2-gate-text")?.textContent).toBe(
      "gate: fails · --fail-on=high · 6 findings fail it · target php 8.4 (--target-php)",
    );
  });

  test("links the grade of the grade line to Findings under it, and reads the line before the waffle", () => {
    render(<App model={model()} />);

    const line = band().querySelector<HTMLElement>(".ov-grade");
    const chip = within(line as HTMLElement).getByRole("link", { name: "critical" });
    expect(chip.getAttribute("href")).toBe("#view=findings&verdict=critical");
    expect(line?.compareDocumentPosition(band().querySelector(".waffle") as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("never shows a share of the lock", () => {
    render(<App model={model()} />);

    for (const part of [".ov-answer", ".ov-gate-wrap", ".ov-picture"])
      expect(band().querySelector(part)?.textContent).not.toContain("%");
  });

  test("says what lockrot is, as fixed text, before the grade", () => {
    render(<App model={model()} />);

    const kicker = band().querySelector(".ov-kicker");
    expect(kicker?.textContent).toBe(
      "lockrot grades each package in composer.lock by its security advisories and its maintenance signals.",
    );
    expect(kicker?.compareDocumentPosition(band().querySelector(".ov-grade") as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("links the gate line to the findings that fail it, with the rail filter's key", () => {
    render(<App model={model()} />);

    const gate = band().querySelector(".overview2-gate a");
    expect(gate?.getAttribute("href")).toBe("#view=findings&gate=fails");
  });

  test("draws one flag bar per carried flag, each with its split by grade", () => {
    render(<App model={model()} />);

    const bars = [...band().querySelectorAll(".overview2-flag-bars > a")].map((bar) => bar.textContent);
    expect(bars).toEqual([
      "abandoned 1 graded critical 1 32 pts",
      "pinned 1 graded high 1 16 pts",
      "left-behind 2 graded critical 2 32 pts",
      "old-promise 3 graded critical 2 · high 1 24 pts",
      "stale 3 graded high 2 · low 1 8 pts",
      "vulnerable 5 graded critical 3 · low 2 68 pts",
    ]);
  });

  test("labels the severity chips apart from the grade chips", () => {
    render(<App model={model()} />);

    const severities = within(band()).getByRole("group", { name: "Advisories by severity" });
    expect(within(severities).getByRole("link", { name: "critical 1" })).toBeTruthy();
    expect(within(band()).getByRole("group", { name: "Grade" })).toBeTruthy();
  });

  test.each([
    ["Grade", "critical 4", "#view=findings&verdict=critical", "Findings 9"],
    ["Advisories by severity", "unrated 2", "#view=advisories&sev=unrated", "Advisories 29"],
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

    const bar = within(band()).getByRole("link", { name: /^stale 3/ });
    expect(bar.getAttribute("href")).toBe("#view=findings&flag=stale");
    fireEvent.click(bar);

    expect(location.hash).toBe("#view=findings&flag=stale");
    expect([...document.querySelectorAll("[data-pkg]")].map((row) => row.getAttribute("data-pkg"))).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "friendsofsymfony/oauth2-php",
    ]);
  });

  test("a click with a modifier is left to the browser", () => {
    render(<App model={model()} />);

    const bar = within(band()).getByRole("link", { name: /^stale 3/ });
    fireEvent.click(bar, { ctrlKey: true });

    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Overview");
  });

  test("links each fix count of the Security block to Findings under that fix", () => {
    render(<App model={model()} />);

    expect(within(band()).getByRole("link", { name: "composer update 2" }).getAttribute("href")).toBe(
      "#view=findings&fix=update",
    );
  });

  test("heads Weighs most with the load line and draws each score as an ordered list", () => {
    render(<App model={model()} />);

    const block = band().querySelector<HTMLElement>(".ov-weighs");
    expect(block?.querySelector(".wm-load")?.textContent).toBe(
      "180 points on 9 flagged packages · 172 (95 %) from high or worse · score model 1",
    );
    const items = [...(block?.querySelectorAll("ol > li") ?? [])];
    expect(items.map((item) => item.querySelector(".wm-label a")?.textContent)).toEqual([
      "symfony/monolog-bridge",
      "symfony/debug",
      "twig/twig",
      "guzzlehttp/guzzle",
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "friendsofsymfony/oauth2-php",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
    const cells = [".wm-label", ".wm-grade", ".wm-reach", ".wm-total", ".wm-terms"].map(
      (cell) => items[8]?.querySelector(cell)?.textContent,
    );
    expect(cells).toEqual(["symfony/polyfill-intl-idn", "low", "transitive", "2 points:", "vulnerable 2"]);
    expect(block?.querySelector(".wm-text")).toBeNull();
  });

  test("hides each Weighs most bar from a screen reader, draws one segment per term in the grade's tone, and has no legend", () => {
    render(<App model={model()} />);

    const block = band().querySelector<HTMLElement>(".ov-weighs") as HTMLElement;
    const bars = [...block.querySelectorAll(".wm-bar")];
    expect(bars).toHaveLength(9);
    expect(bars.every((bar) => bar.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(block.querySelector(".wm-legend")).toBeNull();
    expect(bars[0]?.querySelectorAll(".wm-seg")).toHaveLength(3);
    expect(block.querySelector(".wm-row")?.className).toContain("tone-");
    expect(block.querySelector(".wm-row .wm-terms")?.textContent).toBe(
      "left-behind 16 · old-promise 4 · vulnerable 16",
    );
  });

  test("links a Weighs most row to its package on Findings", () => {
    render(<App model={model()} />);

    const row = within(band().querySelector<HTMLElement>(".ov-weighs") as HTMLElement).getByRole("link", {
      name: named("symfony/debug"),
    });
    expect(row.getAttribute("href")).toBe("#view=findings&pkg=symfony%2Fdebug");
    fireEvent.click(row);

    expect(location.hash).toBe("#view=findings&pkg=symfony%2Fdebug");
  });

  test("draws the exposure rows as links to Blast radius", () => {
    render(<App model={model()} />);

    const row = within(band()).getByRole("link", { name: named("guzzlehttp/guzzle 1 flagged package") });
    expect(row.getAttribute("href")).toBe("#view=radius&pkg=guzzlehttp%2Fguzzle");
    expect(band().querySelector(".ov-ex-head")?.textContent).toBe("Direct requirementflagged, of 9");
  });

  test("tables the packages furthest behind, each linked to its row", () => {
    render(<App model={model()} />);

    const table = within(band()).getByRole("table", { name: "Furthest behind, top 8" });
    const [head, ...rows] = within(table).getAllByRole("row");
    expect(
      within(head as HTMLElement)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Package", "Libyears", "Most recent release"]);
    expect(rows.map((row) => [...row.querySelectorAll("td")].map((td) => td.textContent))).toEqual([
      ["symfony/monolog-bridge v2.6.13", "10.6", "v6.4.45 (2026-08-30)"],
      ["guzzlehttp/guzzle 6.5.8", "4.2", "8.2.0 (2026-09-06)"],
      ["symfony/yaml v5.4.23", "3.4", "v8.1.8 (2026-09-26)"],
      ["twig/twig v2.16.1", "2.0", "v3.30.0 (2026-09-25)"],
      ["symfony/debug v3.4.47", "1.8", "v4.4.44 (2022-07-28)"],
    ]);
    fireEvent.click(within(table).getByRole("link", { name: named("symfony/yaml") }));

    expect(location.hash).toBe("#view=findings&pkg=symfony%2Fyaml");
    expect(document.querySelector(".shell-detail")).not.toBeNull();
  });

  test("lays its parts out in reading order: lead (with Security), Weighs most, flags, Libyears, exposure", () => {
    render(<App model={model()} />);

    expect([...band().children].map((part) => part.className).filter((name) => name !== "vh")).toEqual([
      "ov-lead",
      "ov-weighs",
      "ov-flags",
      "ov-libyears",
      "ov-expo",
    ]);
    expect(band().querySelector(".ov-lead .ledger-advisories")).not.toBeNull();
  });

  test("names itself in an h2 and each block in an h3, in reading order", () => {
    render(<App model={model()} />);

    const headings = [...band().querySelectorAll("h2, h3, h4")].map((h) => [h.tagName, h.textContent]);
    expect(headings.map(([tag]) => tag)).toEqual(["H2", "H3", "H3", "H3", "H3", "H3", "H3", "H3", "H4"]);
    expect(headings[0]?.[1]).toBe("Overview");
    expect(headings.slice(1).map(([, text]) => text?.split(/\s/)[0])).toEqual([
      "Project",
      "Ready",
      "Security",
      "Weighs",
      "Flags",
      "Libyears",
      "Blast",
      "How",
    ]);
  });

  test("states the depth sentence, the accepted line and each fact of the Libyears panel", () => {
    render(<App model={model()} />);

    const text = band().textContent;
    expect(text).toContain("5 carry more than one flag · score model 1");
    expect(text).toContain("2 of 9 flagged packages are named by no line of composer.json");
    expect(text).toContain("Accepted by the allowlist: none in flagged packages");
    const libyears = band().querySelector(".ledger-libyears")?.textContent ?? "";
    expect(libyears).toContain("22.06 libyears");
    expect(libyears).toContain("over 7 packages · 22.06 from direct requirements");
    expect(libyears).toContain("Not measured: 1, a branch snapshot with no release branch · 1, no date");
    expect(libyears).toContain("symfony/monolog-bridge v2.6.13");
  });

  test("says nothing is flagged and draws no flag bar", () => {
    render(
      <App
        model={model((report) => {
          report.packages_flagged = 0;
          report.counts = { ...report.counts, critical: 0, high: 0, low: 0, ok: 7 };
          report.findings = report.findings.map((f) => ({ ...f, verdict: "ok" }));
          report.rot_depth = { ...report.rot_depth, flagged: 0 };
          for (const flag of Object.values(report.flags)) flag.carrying = 0;
        })}
      />,
    );

    expect(band().querySelector(".ov-grade")?.textContent).toBe("Project grade: nothing flagged");
    expect(within(band().querySelector(".ov-grade") as HTMLElement).queryByRole("link")).toBeNull();
    expect(band().querySelector(".wm-load")).toBeNull();
    expect(band().querySelector(".ov-weighs ol")).toBeNull();
    expect(band().textContent).toContain("Nothing to run: no package is flagged.");
    expect(within(band()).queryByRole("group", { name: "Grade" })).toBeNull();
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
    expect(band().querySelector(".ov-grade")).toBeNull();
    expect(band().querySelector(".ov-figure")).toBeNull();
    expect(band().querySelector(".ov-weighs")).toBeNull();
    expect(
      within(band())
        .queryAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["#view=findings&gate=fails"]);
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

describe("the Overview's three lines equal lockrot's page goldens on the page", () => {
  test.each(pageGoldens())("$id", ({ golden, report }) => {
    const result = normalize(report);
    if (!result.ok) throw new Error(result.error.message);
    render(<App model={result.model} />);

    const text = (selector: string) => band().querySelector(selector)?.textContent ?? null;
    // The figure line on the page is the waffle's caption, which also counts the packages not judged.
    expect([text(".ov-grade"), text(".ov-figure"), text(".wm-load")]).toEqual([
      golden.grade_line,
      golden.waffle_caption,
      golden.load_line,
    ]);
  });
});

describe("an Advisories tab with no advisory (R14)", () => {
  test("still leads with the Security summary", () => {
    const embed = assembleEmbed("C-baselined-dagger");
    const result = normalize(embed);
    if (!result.ok) throw new Error(result.error.message);
    history.replaceState(null, "", "/report.html#view=advisories");
    render(<App model={result.model} />);

    const tab = document.querySelector('[data-surface="advisories"]');
    expect(tab?.querySelector(".al-lead")).not.toBeNull();
  });
});

describe("the tabs that lead without the band", () => {
  function surface(name: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(`[data-surface="${name}"]`);
    if (found === null) throw new Error(`no ${name} surface`);
    return found;
  }

  test("Advisories leads with the Security block, its answer counted once, and no Update now", () => {
    history.replaceState(null, "", "/report.html#view=advisories");
    render(<App model={model()} />);

    const advisories = surface("advisories");
    const lead = advisories.querySelector<HTMLElement>(".al-lead");
    expect(lead).not.toBeNull();
    expect(lead?.querySelector(".al-answer")?.textContent).toBe("29 advisories on 5 packages.");
    expect(advisories.textContent.match(/29 advisories/g)).toHaveLength(1);
    expect(advisories.textContent).not.toContain("by severity:");
    const chips = within(within(lead as HTMLElement).getByRole("group", { name: "Advisories by severity" }));
    expect(chips.getByRole("button", { name: "critical 1" })).toBeTruthy();
    // A command lives in its row; Overview's ready-to-run block replaces Update now.
    expect(lead?.textContent).not.toContain("Update now");
    expect(lead?.compareDocumentPosition(advisories.querySelector('[role="row"][data-pkg]') as Node)).toBe(
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
    expect(lead?.textContent).toContain("without it there are 29.");
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
      "2 of 9 flagged packages are named by no line of composer.json; the deepest, friendsofsymfony/oauth2-php, symfony/polyfill-intl-idn, sit 1 hop from the nearest line.",
    );
  });

  test("R2-37: heads the depth part when a lock-only run has no depth rows, only the sentence", () => {
    const result = normalize(assembleEmbed("lock-only-dagger"));
    if (!result.ok) throw new Error(result.error.message);
    render(<App model={result.model} />);

    const head = within(band()).getByRole("heading", { name: "How deep the flagged packages sit" });
    expect(head.tagName).toBe("H3");
    expect(head.parentElement?.querySelector(".ledger-note")?.textContent).toBe(
      "lockrot did not read composer.json, so it does not know how deep the 1 flagged package sits.",
    );
  });

  test("R2-37: heads the depth part with an h4 under Blast radius when the run has no depth rows", () => {
    render(
      <App
        model={model((report) => {
          report.rot_depth = {
            ...report.rot_depth,
            unmeasured: { ...report.rot_depth.unmeasured, no_composer_json: 1 },
          };
        })}
      />,
    );

    expect(within(band()).getByRole("heading", { name: "How deep the flagged packages sit" }).tagName).toBe(
      "H4",
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
        "lockrot report · data as of 2026-10-01 · lockrot 0.14.0 · score model 1 · target PHP 8.4 · this run fails · --fail-on=high",
        "9 of 9 packages flagged (100%): 4 graded critical, 2 high, 3 low. Flags: abandoned 1, pinned 1, left-behind 2, old-promise 3, stale 3, vulnerable 5.",
        "All 9 in production · 7 required directly, 2 pulled in · 29 security advisories on 5 packages (severity: 1 critical, 5 high, 12 medium, 2 unrated, 9 low) · fix by package: 2 composer update, 1 upgrade, 2 php floor raise · 22.1 libyears behind.",
      ].join("\n"),
    );
  });
});

describe("the overview's Update now line", () => {
  test("is gone from Overview: Ready to run follows the ready-to-run rule instead", () => {
    render(<App model={model()} />);

    expect(band().textContent).not.toContain("Update now");
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

describe("a grade line with nothing graded above a failing gate", () => {
  test("is neutral, with no all-clear mark, on lockrot's ok-offline page golden", () => {
    const golden = pageGoldens().find(({ id }) => id === "ok-offline");
    if (golden === undefined) throw new Error("no ok-offline page golden");
    const result = normalize(golden.report);
    if (!result.ok) throw new Error(result.error.message);
    render(<App model={result.model} />);

    const grade = band().querySelector(".ov-grade");
    expect(grade?.classList.contains("tone-unk")).toBe(true);
    expect(grade?.querySelector(".clean-mark")).toBeNull();
  });

  test("keeps the all-clear mark when nothing is graded and the gate passes", () => {
    const golden = pageGoldens().find(({ id }) => id === "new-symfony");
    if (golden === undefined) throw new Error("no new-symfony page golden");
    const result = normalize(golden.report);
    if (!result.ok) throw new Error(result.error.message);
    render(<App model={result.model} />);

    const grade = band().querySelector(".ov-grade");
    expect(grade?.classList.contains("tone-none")).toBe(true);
    expect(grade?.querySelector(".clean-mark")).not.toBeNull();
  });
});

describe("one shell choice for every command box on the page (R4-30)", () => {
  function moveCheckModel(): Model {
    const result = normalize(assembleEmbed("mc-composite-dagger"));
    if (!result.ok) throw new Error(result.error.message);
    return result.model;
  }
  const shellButtons = (): string[] =>
    [...document.querySelectorAll(".d2-shell-btn")].map((button) => button.textContent);
  const pickCmdIn = (box: HTMLElement): void => {
    fireEvent.click(within(box).getByRole("button", { name: "Shell: POSIX" }));
    fireEvent.click(within(within(box).getByRole("menu")).getByRole("menuitemradio", { name: /cmd\.exe/ }));
  };
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  test("a pick in one Ready to run box changes every box", () => {
    render(<App model={moveCheckModel()} />);
    const boxes = [...band().querySelectorAll<HTMLElement>(".ov-cmd")];
    expect(boxes.length).toBeGreaterThan(1);

    pickCmdIn(boxes[1] as HTMLElement);

    expect(shellButtons()).toEqual(boxes.map(() => "cmd.exe"));
    for (const box of boxes) expect(box.querySelector(".d2-copy-cmd")?.textContent).not.toContain("'");
  });

  test("holds the pick for a box opened later when storage refuses it", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<App model={moveCheckModel()} />);
    const [first] = [...band().querySelectorAll<HTMLElement>(".ov-cmd")];
    pickCmdIn(first as HTMLElement);

    fireEvent.click(within(first?.closest(".ov-move") as HTMLElement).getAllByRole("link")[0] as HTMLElement);

    const sheet = document.querySelector<HTMLElement>('[data-surface="detail"]');
    expect(sheet?.querySelector(".d2-shell-btn")?.textContent).toBe("cmd.exe");
  });
});
