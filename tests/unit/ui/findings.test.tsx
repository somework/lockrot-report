import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Report2 } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";
import { readContractJson } from "../words/recorded";

function model(caseName: string): Model {
  const result = normalize(assembleEmbed(caseName));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function withReport(base: Model, edit: (report: Report2) => Report2): Model {
  return { ...base, report: edit(base.report) };
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
    const score = composite.report.findings.find((f) => f.package === "symfony/monolog-bridge")?.score;
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

describe("the Findings list when it has no rows", () => {
  test("says nothing was flagged, with nothing to clear, when no finding is graded", () => {
    render(<App model={withReport(model("composite"), (report) => ({ ...report, findings: [] }))} />);

    const surface = document.querySelector('[data-surface="findings"]');
    expect(surface?.textContent).toContain("Nothing was flagged.");
    expect(within(surface as HTMLElement).queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  test("says the filter matched nothing, and Clear filters brings every row back", () => {
    render(<App model={model("composite")} />);

    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "no-such-package" } });
    const surface = document.querySelector('[data-surface="findings"]') as HTMLElement;
    expect(surface.textContent).toContain("Nothing matches this filter.");
    expect(surface.textContent).not.toContain("Nothing was flagged.");

    fireEvent.click(within(surface).getByRole("button", { name: "Clear filters" }));
    expect(document.querySelectorAll('[data-surface="findings"] li.f2-row')).toHaveLength(7);
    expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("");
  });

  test("says the filter matched nothing on Advisories too", () => {
    history.replaceState(null, "", "/report.html#view=advisories&q=no-such-package");
    render(<App model={model("composite")} />);

    const surface = document.querySelector('[data-surface="advisories"]') as HTMLElement;
    expect(surface.textContent).toContain("Nothing matches this filter.");
    expect(within(surface).getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  test("says the same on All packages", () => {
    history.replaceState(null, "", "/report.html#view=packages");
    render(<App model={withReport(model("composite"), (report) => ({ ...report, findings: [] }))} />);

    expect(document.querySelector('[data-surface="packages"]')?.textContent).toContain(
      "Nothing was flagged.",
    );
  });
});

const LINK_ROW = "copy/debug";

/** The composite plus a last row whose next step links out: recorded case C's `symfony/debug`,
 *  its replacement a repository suggestion (no resolved package) that carries a url. */
function withLinkRow(): Model {
  const debug = (readContractJson("report-2", "C.json") as Report2).findings.find(
    (f) => f.package === "symfony/debug",
  );
  const step = debug?.next_step;
  if (debug === undefined || !step?.replacement)
    throw new Error("C.json has symfony/debug with a replacement");
  const next_step = { ...step, replacement: { ...step.replacement, package: null, finding: null } };
  return withReport(model("composite"), (report) => ({
    ...report,
    findings: [...report.findings, { ...debug, package: LINK_ROW, verdict: "low", rank: 8, next_step }],
  }));
}

function linkOf(pkg: string): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(`[data-surface="findings"] li[data-pkg="${pkg}"] a`);
  if (link === null) throw new Error(`no link in ${pkg}`);
  return link;
}

describe("opening a row", () => {
  const openRow = (pkg: string): HTMLElement => {
    const found = document.querySelector<HTMLElement>(`[data-surface="findings"] li[data-pkg="${pkg}"]`);
    if (found === null) throw new Error(`no row ${pkg}`);
    return found;
  };

  test("a click opens the package, and a second click on the open row keeps it open", () => {
    render(<App model={model("composite")} />);

    fireEvent.click(openRow("symfony/debug"));
    expect(location.hash).toContain("pkg=symfony%2Fdebug");
    fireEvent.click(openRow("symfony/debug"));

    expect(location.hash).toContain("pkg=symfony%2Fdebug");
    expect(openRow("symfony/debug").getAttribute("aria-current")).toBe("true");
  });

  test("a click on a second Advisories row of the open package keeps it open", () => {
    history.replaceState(null, "", "/report.html#view=advisories&pkg=symfony%2Fyaml");
    render(<App model={model("composite")} />);
    const rows = document.querySelectorAll<HTMLElement>(
      '[data-surface="advisories"] li[data-pkg="symfony/yaml"]',
    );

    fireEvent.click(rows[1] as HTMLElement);

    expect(location.hash).toContain("pkg=symfony%2Fyaml");
  });

  test("a click that lands on a link inside the row opens nothing", () => {
    render(<App model={withLinkRow()} />);
    const link = linkOf(LINK_ROW);
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });

    fireEvent.click(link);

    expect(location.hash).not.toContain("pkg=");
  });
});

describe("the list's one Tab stop", () => {
  const stops = (selector: string): string[] =>
    [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((row) => row.tabIndex === 0)
      .map((row) => row.getAttribute("data-pkg") ?? "");

  test("is the first Findings row with nothing open, and a link of any other row is out of the Tab order", () => {
    render(<App model={withLinkRow()} />);

    expect(stops('[data-surface="findings"] li.f2-row')).toEqual(["twig/twig"]);
    expect(linkOf(LINK_ROW).tabIndex).toBe(-1);
  });

  test("puts the links of the open row back into the Tab order", () => {
    history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent(LINK_ROW)}`);
    render(<App model={withLinkRow()} />);

    expect(stops('[data-surface="findings"] li.f2-row')).toEqual([LINK_ROW]);
    expect(linkOf(LINK_ROW).tabIndex).toBe(0);
  });

  test("is the open package's row, on Findings and on All packages", () => {
    history.replaceState(null, "", "/report.html#pkg=symfony%2Fdebug");
    render(<App model={model("composite")} />);
    expect(stops('[data-surface="findings"] li.f2-row')).toEqual(["symfony/debug"]);

    fireEvent.click(screen.getByRole("tab", { name: /^All packages/ }));
    expect(stops('[data-surface="packages"] tr[data-pkg]')).toEqual(["symfony/debug"]);
  });

  test("is a package's first Advisories row only, while every row of the open package reads as current", () => {
    history.replaceState(null, "", "/report.html#view=advisories&pkg=symfony%2Fyaml");
    render(<App model={model("composite")} />);

    const rows = [
      ...document.querySelectorAll<HTMLElement>('[data-surface="advisories"] li[data-pkg="symfony/yaml"]'),
    ];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((row) => row.tabIndex)).toEqual(rows.map((_, index) => (index === 0 ? 0 : -1)));
    expect(rows.every((row) => row.getAttribute("aria-current") === "true")).toBe(true);
    expect(stops('[data-surface="advisories"] li[data-pkg]')).toEqual(["symfony/yaml"]);
  });
});

describe("the age axis in the Findings column head", () => {
  test("is captioned once with the run's own release thresholds, over an axis of max(10, 2 x high) years", () => {
    render(<App model={model("composite")} />);

    // composite: release-warn-years 3 and release-high-years 5, so the axis runs to 10.
    const axis = screen.getByRole("img", { name: /^age axis:/ });
    expect(axis.getAttribute("aria-label")).toBe(
      "age axis: years since the last release, 0 to 10 and more; warn at 3 years, high at 5 years",
    );
    expect([...axis.querySelectorAll(".fhead-tick")].map((tick) => tick.textContent)).toEqual([
      "0",
      "3y",
      "5y",
      "10y+",
    ]);
  });

  test("draws every bar on that one axis, and an age past its end runs to the edge, marked as cut", () => {
    const aged = withReport(model("composite"), (report) => ({
      ...report,
      findings: report.findings.map((f) => {
        const years =
          f.package === "symfony/monolog-bridge" ? 4 : f.package === "tubalmartin/cssmin" ? 12 : null;
        const reading = f.age.branch_release;
        if (years === null || reading === null) return f;
        return { ...f, age: { ...f.age, branch_release: { ...reading, years } } };
      }),
    }));
    render(<App model={aged} />);

    // 4 of 10 years is 40%; 12 years is capped at 100% while its number stays exact.
    const bar = (pkg: string) => row(pkg).querySelector<HTMLElement>(".age-bar");
    expect(bar("symfony/monolog-bridge")?.style.width).toBe("40%");
    expect(bar("symfony/monolog-bridge")?.classList.contains("is-over")).toBe(false);
    expect(bar("tubalmartin/cssmin")?.style.width).toBe("100%");
    expect(bar("tubalmartin/cssmin")?.classList.contains("is-over")).toBe(true);
    expect(text(row("tubalmartin/cssmin"), ".age-num")).toBe("12.0");
  });

  test("is not drawn, and no row draws a scale, when the run recorded no thresholds", () => {
    const bare = withReport(model("composite"), (report) => ({
      ...report,
      run: { ...report.run, thresholds: null },
    }));
    render(<App model={bare} />);

    expect(screen.queryByRole("img", { name: /^age axis:/ })).toBeNull();
    expect(document.querySelectorAll('[data-surface="findings"] .age-guide')).toHaveLength(0);
  });
});

describe("a long package name", () => {
  test("breaks only after its vendor's slash, on Findings and on All packages", () => {
    history.replaceState(null, "", "/report.html");
    render(<App model={model("composite")} />);
    const finding = row("symfony/monolog-bridge");

    expect(text(finding, ".fc-vendor")).toBe("symfony/");
    expect(finding.querySelector(".fc-vendor + wbr")).not.toBeNull();
    expect(text(finding, ".fc-unit")).toBe("monolog-bridge");

    fireEvent.click(screen.getByRole("tab", { name: /^All packages/ }));
    const cell = document.querySelector('tr[data-pkg="symfony/monolog-bridge"] .p2-name');
    expect(cell?.querySelector("wbr")).not.toBeNull();
    expect(text(cell, ".p2-unit")).toBe("monolog-bridge");
    expect(cell?.textContent).toBe("symfony/monolog-bridge");
  });
});

describe("the All packages table as a list", () => {
  test("marks only the open package's row current, and every row stays focusable", () => {
    history.replaceState(null, "", "/report.html#view=packages&pkg=symfony%2Fyaml");
    render(<App model={model("composite")} />);

    const rows = [...document.querySelectorAll<HTMLElement>("tr[data-pkg]")];
    expect(
      rows.filter((tr) => tr.getAttribute("aria-current") === "true").map((tr) => tr.dataset["pkg"]),
    ).toEqual(["symfony/yaml"]);
    expect(rows.every((tr) => tr.hasAttribute("tabindex"))).toBe(true);
  });

  test("a second click on the Score head reverses the order and moves aria-sort", () => {
    history.replaceState(null, "", "/report.html#view=packages");
    render(<App model={model("composite")} />);

    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    fireEvent.click(screen.getByRole("button", { name: /^Score/ }));

    const scores = [...document.querySelectorAll("tr[data-pkg] .p2-score")].map((td) =>
      Number(td.textContent),
    );
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(screen.getByRole("columnheader", { name: /Score/ }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getByRole("columnheader", { name: /Package/ }).getAttribute("aria-sort")).toBe("none");
  });
});
