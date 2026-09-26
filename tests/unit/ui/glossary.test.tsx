import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { INITIAL_STATE } from "../../../src/state/types";
import { ReportContext, type ReportContextValue } from "../../../src/ui/context";
import { Glossary } from "../../../src/ui/Glossary";

afterEach(cleanup);

function loadMini(): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", "mini.json"), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error("mini.json failed to normalize");
  return result.model;
}

function renderGlossary(props: { open: boolean; highlightTerm?: string | null; onClose?: () => void }) {
  const highlightTerm = props.highlightTerm ?? null;
  const model = loadMini();
  const value: ReportContextValue = {
    model,
    state: INITIAL_STATE,
    dispatch: vi.fn(),
    now: new Date(model.report.generatedAt),
    wide: true,
    cursor: null,
    openGlossary: vi.fn(),
    openGlossaryFrom: vi.fn(),
  };
  return render(
    <ReportContext.Provider value={value}>
      <Glossary open={props.open} onClose={props.onClose ?? vi.fn()} highlightTerm={highlightTerm} />
    </ReportContext.Provider>,
  );
}

describe("Glossary / highlightTerm (PD-GLOSSARY-7, DESIGN.md §5)", () => {
  it("marks the term's dt/dd pair and focuses the term, ahead of the default focus on Close", () => {
    // Act
    const { container } = renderGlossary({ open: true, highlightTerm: "abandoned" });

    // Assert
    const dt = container.querySelector('dt[data-term="abandoned"]');
    const dd = dt?.nextElementSibling ?? null;
    expect(dt?.classList.contains("glossary-highlight")).toBe(true);
    expect(dd?.classList.contains("glossary-highlight")).toBe(true);
    expect(document.activeElement).toBe(dt);
  });

  it("clears the highlight after its own timer, on both the term and its definition", () => {
    // Arrange
    vi.useFakeTimers();

    // Act
    const { container } = renderGlossary({ open: true, highlightTerm: "silent" });
    const dt = container.querySelector('dt[data-term="silent"]');
    const dd = dt?.nextElementSibling ?? null;
    expect(dt?.classList.contains("glossary-highlight")).toBe(true);

    vi.advanceTimersByTime(1600);

    // Assert
    expect(dt?.classList.contains("glossary-highlight")).toBe(false);
    expect(dd?.classList.contains("glossary-highlight")).toBe(false);

    vi.useRealTimers();
  });

  it("focuses Close, not any term, when no highlightTerm is given — the '?' shortcut and Header's button", () => {
    // Act
    const { container } = renderGlossary({ open: true, highlightTerm: null });

    // Assert
    expect(container.querySelector(".glossary-highlight")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Close");
  });

  it("does nothing for a term this report's glossary carries no entry for", () => {
    // Act
    const { container } = renderGlossary({ open: true, highlightTerm: "not-a-real-verdict" });

    // Assert: falls back to the same default as no term at all, rather than throwing.
    expect(container.querySelector(".glossary-highlight")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Close");
  });
});

describe("PD-GLOSSARY-10 (DESIGN.md §5): the allowlist note is a maintainer's step, out of the reading path", () => {
  it("is not inside finished's definition any more, and the verdicts keep one <dd> per <dt>", () => {
    // Act
    const { container } = renderGlossary({ open: true });

    // Assert
    const verdictDl = container.querySelectorAll(".glossary-sect")[0]?.querySelector(".deflist");
    const dts = verdictDl?.querySelectorAll(":scope > dt") ?? [];
    const dds = verdictDl?.querySelectorAll(":scope > dd") ?? [];
    expect(dds.length).toBe(dts.length);
    expect(verdictDl?.textContent).not.toContain("extra.lockrot.ignore");
  });

  it("sits in its own last fold, closed, linking to the configuration docs' allowlist section", () => {
    // Act
    const { container } = renderGlossary({ open: true });

    // Assert
    const sections = container.querySelectorAll(".glossary-sect");
    const last = sections[sections.length - 1];
    expect(last?.tagName).toBe("DETAILS");
    expect((last as HTMLDetailsElement).open).toBe(false);
    expect(last?.querySelector("summary")?.textContent).toMatch(/maintainers/);
    expect(last?.querySelector(".glossary-note")?.textContent).toContain("extra.lockrot.ignore");
    expect(last?.querySelector("a.out")?.getAttribute("href")).toBe(
      "https://lockrot.dev/configuration/#the-allowlist",
    );
  });

  it("opens the libyears section from the start", () => {
    // Act
    const { container } = renderGlossary({ open: true });

    // Assert
    const libyears = Array.from(container.querySelectorAll("details.glossary-sect")).find((d) =>
      d.querySelector("summary")?.textContent.includes("libyears"),
    );
    expect((libyears as HTMLDetailsElement | undefined)?.open).toBe(true);
  });
});
