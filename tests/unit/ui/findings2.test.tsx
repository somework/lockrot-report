import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report2";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { readContractJson } from "../words/recorded";

function model(caseName: string): Model {
  const result = normalize(assembleEmbed(caseName));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function withReport(base: Model, edit: (report: Report2) => Report2): Model {
  const embed = base.report2;
  if (embed === null) throw new Error("not a report-2 model");
  return { ...base, report2: { ...embed, report: edit(embed.report) } };
}

function row(pkg: string): HTMLElement {
  return screen.getByRole("listitem", { name: pkg });
}

function text(element: Element | null, selector: string): string | null {
  return element?.querySelector(selector)?.textContent ?? null;
}

function pills(element: Element): string[] {
  return [...element.querySelectorAll(".fp")].map((pill) => pill.textContent);
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1181"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  history.replaceState(null, "", "/report.html");
});
afterEach(() => {
  cleanup();
});

describe("the report-2 Findings tab", () => {
  test("groups the rows by grade, the grade as the head's word and the count beside it", () => {
    render(<App model={model("composite")} />);

    const heads = [...document.querySelectorAll(".fgroup-head")].map((head) => [
      text(head, "h2"),
      text(head, ".fgroup-count"),
    ]);
    expect(heads).toEqual([
      ["critical", "3 packages"],
      ["high", "2 packages"],
      ["low", "2 packages"],
    ]);
  });

  test("draws the score, its hidden bar, the pills, the age, the reach and the next step", () => {
    const composite = model("composite");
    render(<App model={composite} />);

    const bridge = row("symfony/monolog-bridge");
    expect(text(bridge, ".f2-num")).toBe("36");
    const bar = bridge.querySelector(".sbar");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    const score = composite.report2?.report.findings.find(
      (f) => f.package === "symfony/monolog-bridge",
    )?.score;
    expect(bar?.getAttribute("title")).toBe(score?.text);
    expect([...(bar?.querySelectorAll(".sbar-seg") ?? [])].map((seg) => seg.classList[1])).toEqual([
      "is-lead",
      "is-corroborating",
      "is-security",
    ]);
    expect(pills(bridge)).toEqual(["left-behind·6.9 y", "old-promise·PHP 5", "vulnerable·1"]);
    expect(bridge.querySelector(".f2-age")?.getAttribute("aria-label")).toMatch(
      /^installed branch last released 6\.9 years ago; warn at/,
    );
    expect(text(bridge, ".f2-reach")).toBe("direct");
    expect(text(bridge, ".f2-next")).toBe("require ^5.4.52");
  });

  test("says a package holds the move, and draws no age where no reading was judged", () => {
    render(<App model={model("composite")} />);

    const twig = row("twig/twig");
    expect(text(twig, ".f2-next")).toBe("php floor raise · held");
    expect(twig.querySelector(".f2-age")?.classList.contains("is-empty")).toBe(true);
  });

  test("says who accepted every maintenance flag in muted words, not as a pill", () => {
    render(<App model={model("composite")} />);

    const idn = row("symfony/polyfill-intl-idn");
    expect(text(idn, ".f2-accepted")).toBe("maintenance accepted (lockrot's list)");
    expect(pills(idn)).toEqual(["vulnerable·1"]);
  });

  test("marks the baseline in words a screen reader hears", () => {
    render(<App model={model("B-baselined-dagger")} />);

    const marks = [...row("symfony/monolog-bridge").querySelectorAll(".fp-mark")].map((m) => m.textContent);
    expect(marks).toEqual([
      "known to the baseline",
      "covered by the recorded left-behind",
      "new since the baseline",
    ]);
  });

  test("hides the accepted pills from the rail and keeps every row", () => {
    render(<App model={model("B-accepted-dagger")} />);

    expect(pills(row("symfony/monolog-bridge"))).toEqual([
      "vulnerable·1",
      "left-behind·accepted",
      "old-promise·accepted",
    ]);
    const rail = screen.getByRole("group", { name: "Filters" });
    fireEvent.click(within(rail).getByRole("button", { name: "Hide accepted flags 1" }));

    expect(pills(row("symfony/monolog-bridge"))).toEqual(["vulnerable·1"]);
    expect(location.hash).toContain("accepted=hide");
  });

  test("writes a run note over three or more rows that one part decides", () => {
    const composite = model("composite");
    const runOfThree = withReport(composite, (report) => {
      const yaml = report.findings.find((f) => f.package === "symfony/yaml");
      if (yaml === undefined) throw new Error("composite has symfony/yaml");
      const copies = [6.3, 6.6].map((rank) => ({ ...yaml, package: `copy/yaml-${rank}`, rank }));
      return { ...report, findings: [...report.findings, ...copies] };
    });
    render(<App model={runOfThree} />);

    expect([...document.querySelectorAll(".frun-note")].map((note) => note.textContent)).toEqual([
      "4 packages, all vulnerable",
    ]);
    expect(screen.getByRole("list", { name: "4 packages, all vulnerable" })).toBeTruthy();
  });

  test("names the packages whose advisories were not checked, each one click from its detail", () => {
    render(<App model={model("B-offline-dagger")} />);

    const note = document.querySelector(".f2-note");
    expect(note?.textContent).toMatch(/^\d+ packages? (was|were) not checked for advisories: /);
    const first = note?.querySelector("button");
    if (!(first instanceof HTMLButtonElement)) throw new Error("the note names a package");
    fireEvent.click(first);
    expect(location.hash).toContain(`pkg=${encodeURIComponent(first.textContent)}`);
  });
});

describe("the report-2 All packages tab", () => {
  function openPackages(name: string): void {
    render(<App model={model(name)} />);
    fireEvent.click(screen.getByRole("tab", { name: /^All packages/ }));
  }

  function cells(pkg: string): Record<string, string> {
    const tr = document.querySelector(`tr[data-pkg="${pkg}"]`);
    return Object.fromEntries(
      [...(tr?.querySelectorAll("td") ?? [])].map((td) => [
        td.className.replace(/^num /, ""),
        td.textContent,
      ]),
    );
  }

  test("heads its ten columns and opens in rank order", () => {
    openPackages("composite");

    expect(screen.getAllByRole("columnheader").map((th) => th.textContent.replace(/ [↑↓]$/, ""))).toEqual([
      "Package",
      "Version",
      "Libyears",
      "Age",
      "Verdict",
      "Score",
      "Flags",
      "Reached",
      "Signals",
      "Data as of",
    ]);
    expect([...document.querySelectorAll("tr[data-pkg]")].map((tr) => tr.getAttribute("data-pkg"))[0]).toBe(
      "twig/twig",
    );
  });

  test("says an unmeasured value's cause in words and reads hops from depth", () => {
    openPackages("composite");

    const idn = cells("symfony/polyfill-intl-idn");
    expect(idn["p2-verdict"]).toBe("low");
    expect(idn["p2-score"]).toBe("2");
    expect(idn["p2-reach"]).toBe("1 hop");
    const ly = document.querySelector('tr[data-pkg="symfony/polyfill-intl-idn"] .p2-ly [title]');
    expect(ly?.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(ly?.querySelector(".vh")?.textContent).toBe(ly?.getAttribute("title"));
  });

  test("prints a dash for a package whose every pill the accepted toggle hides", () => {
    const psrLog = (readContractJson("model-only", "psr-log.json") as Report2).findings.find(
      (f) => f.package === "psr/log",
    );
    if (psrLog === undefined) throw new Error("psr-log.json has psr/log");
    const withPsrLog = withReport(model("composite"), (report) => ({
      ...report,
      findings: [...report.findings, { ...psrLog, rank: 8 }],
    }));
    history.replaceState(null, "", "/report.html#view=packages&accepted=hide");
    render(<App model={withPsrLog} />);

    expect(document.querySelector('tr[data-pkg="psr/log"] .p2-flags')?.textContent).toBe("—");
  });

  test("sorts by score, highest first, from the Score head", () => {
    openPackages("composite");

    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    const scores = [...document.querySelectorAll("tr[data-pkg] .p2-score")].map((td) =>
      Number(td.textContent),
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(screen.getByRole("columnheader", { name: /Score/ }).getAttribute("aria-sort")).toBe("descending");
  });
});
