import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Action } from "../../../src/state/types";
import { ReportContext } from "../../../src/ui/context";
import { Glossary } from "../../../src/ui/Glossary";

afterEach(cleanup);

function composite(extraSignals: string[] = []): Model {
  const embed = assembleEmbed("composite");
  embed.report.run.signal_ids = [...embed.report.run.signal_ids, ...extraSignals];
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

interface Props {
  open: boolean;
  onClose?: () => void;
  dispatch?: (action: Action) => void;
  model?: Model;
}

function glossary({ open, onClose = vi.fn(), dispatch = vi.fn(), model = composite() }: Props) {
  return (
    <ReportContext.Provider
      value={{
        model,
        state: INITIAL_STATE,
        dispatch,
        now: new Date(model.report.generated_at),
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
        shell: "posix",
        pickShell: vi.fn(),
      }}
    >
      <button type="button">trigger</button>
      <Glossary open={open} shortcutsOn onShortcutsChange={vi.fn()} onClose={onClose} />
    </ReportContext.Provider>
  );
}

function sections(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".glossary-sect")];
}

function fold(container: ParentNode, title: RegExp): HTMLDetailsElement {
  const found = sections(container).find((section) =>
    title.test(section.querySelector("summary")?.textContent ?? ""),
  );
  if (!(found instanceof HTMLDetailsElement)) throw new Error(`no fold titled ${String(title)}`);
  return found;
}

describe("Glossary focus", () => {
  it("puts focus on Close when it opens", () => {
    render(glossary({ open: true }));

    expect(document.activeElement?.textContent).toBe("Close");
  });

  it("hands focus back to what held it when it closes", () => {
    const { rerender } = render(glossary({ open: false }));
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();

    rerender(glossary({ open: true }));
    expect(document.activeElement).not.toBe(trigger);
    rerender(glossary({ open: false }));

    expect(document.activeElement).toBe(trigger);
  });

  it("calls onClose from its Close button", () => {
    const onClose = vi.fn();
    render(glossary({ open: true, onClose }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Glossary sections", () => {
  it("opens with the seven verdicts and the eight flags in view, and the rest folded", () => {
    const { container } = render(glossary({ open: true }));

    expect(screen.getByRole("heading", { name: "The seven verdicts" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The eight flags" })).toBeTruthy();
    // The terms are run.verdicts, then run.flag_ids, each with its count when it has one.
    expect([...container.querySelectorAll("dt[data-term]")].map((dt) => dt.textContent)).toEqual([
      "critical 4",
      "high 2",
      "medium",
      "low 3",
      "unknown",
      "finished",
      "ok",
      "abandoned 1",
      "silent",
      "pinned 1",
      "left-behind 2",
      "old-promise 3",
      "stale 3",
      "capped",
      "vulnerable 5",
    ]);
    expect(fold(container, /flags/).open).toBe(true);
    for (const title of [/signals/, /libyears/, /Keys and search/, /maintainers/])
      expect(fold(container, title).open, String(title)).toBe(false);
  });

  it("takes a grade's floor from the model and a flag's years from the run's thresholds", () => {
    const { container } = render(glossary({ open: true }));

    expect(container.querySelector('dt[data-term="critical"] + dd')?.textContent).toBe(
      "A score from 32: a critical finding.",
    );
    expect(container.querySelector('dt[data-term="silent"] + dd')?.textContent).toContain(
      "5 years (release-high-years)",
    );
  });

  it("links the verdicts' anchor on lockrot.dev", () => {
    render(glossary({ open: true }));

    expect(screen.getByRole("link", { name: /The verdicts on lockrot.dev/ }).getAttribute("href")).toBe(
      "https://lockrot.dev/verdicts/#the-nine-verdicts",
    );
  });

  it("keeps one definition per verdict and the allowlist note out of the reading path", () => {
    const { container } = render(glossary({ open: true }));

    const verdicts = sections(container)[0];
    expect(verdicts?.querySelectorAll("dt")).toHaveLength(verdicts?.querySelectorAll("dd").length ?? -1);
    expect(verdicts?.textContent).not.toContain("extra.lockrot.ignore");
  });

  it("keeps the allowlist note in its own last fold, closed", () => {
    const { container } = render(glossary({ open: true }));

    const all = sections(container);
    const last = all[all.length - 1];
    expect(last).toBe(fold(container, /maintainers/));
    expect((last as HTMLDetailsElement).open).toBe(false);
    expect(last?.querySelector(".glossary-note")?.textContent).toContain("extra.lockrot.ignore");
  });

  it("names / and j k as keys of the tabs with a list, and Esc and ? as keys of every tab", () => {
    const { container } = render(glossary({ open: true }));

    const lines = [...fold(container, /Keys and search/).querySelectorAll("p")].map((p) => p.textContent);
    expect(lines.slice(0, 2)).toEqual([
      "On a tab with a list: / to search · j k to move · Enter to open.",
      "On every tab: Esc to close · ? for this glossary.",
    ]);
  });

  it("lists the search keys of the grammar in the keys fold", () => {
    const { container } = render(glossary({ open: true }));

    const keys = [...fold(container, /Keys and search/).querySelectorAll("code")].map((code) =>
      code.textContent.trim(),
    );
    expect(keys).toEqual(["flag:", "lead:", "verdict:", "score:>=N", "priority:"]);
  });

  it("closes itself and opens the Run tab from the link to How the score works", () => {
    const onClose = vi.fn();
    const dispatch = vi.fn();
    render(glossary({ open: true, onClose, dispatch }));

    fireEvent.click(screen.getByRole("link", { name: /How the score works/ }));

    expect(dispatch).toHaveBeenCalledWith({ type: "view", view: "run" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Glossary signals", () => {
  function signalTerms(container: ParentNode): string[] {
    return [...fold(container, /signals/).querySelectorAll("dt")].map(
      (dt) => dt.textContent.trim().split(" ")[0] ?? "",
    );
  }

  it("lists the run's signal ids in the run's order, S9 by its report-2 meaning", () => {
    const { container } = render(glossary({ open: true }));

    expect(signalTerms(container)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
      "S11",
    ]);
    const s9 = [...fold(container, /signals/).querySelectorAll("dt")].find((dt) =>
      dt.textContent.startsWith("S9"),
    );
    expect(s9?.nextElementSibling?.textContent).toBe(
      "Advisories on the installed version; raises the vulnerable flag.",
    );
  });

  it("lists an id this page does not know after the known ones, with what its shape says of it", () => {
    const model = composite(["S99", "acme:licence"]);
    const { container } = render(glossary({ open: true, model }));

    const signals = fold(container, /signals/);
    expect(signalTerms(container).slice(11)).toEqual(["S99", "acme:licence"]);
    const defs = [...signals.querySelectorAll("dd")].map((dd) => dd.textContent).slice(11);
    expect(defs).toEqual([
      "A lockrot check this page does not know.",
      "A check from outside lockrot, which this page does not know.",
    ]);
    // A newer lockrot check links to the list of signals, a check from outside lockrot to nothing.
    const [lockrot, vendor] = [...signals.querySelectorAll("dt")].slice(11);
    expect(lockrot?.querySelector("a")?.getAttribute("href")).toBe(
      "https://lockrot.dev/verdicts/#the-signals",
    );
    expect(vendor?.querySelector("a")).toBeNull();
  });
});
