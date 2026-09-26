import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRef } from "preact";
import type { ComponentChild } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";

import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { INITIAL_STATE, type State } from "../../../src/state/types";
import { ReportContext } from "../../../src/ui/context";
import { SearchBar } from "../../../src/ui/search/SearchBar";
import { FindingsView } from "../../../src/ui/views/FindingsView";
import { PackagesView } from "../../../src/ui/views/PackagesView";
import { AdvisoriesView } from "../../../src/ui/views/AdvisoriesView";

afterEach(cleanup);

/** wallabag: 14 hoa/* packages, and wallabag/rulerz and wallabag/rulerz-bundle, whose evidence
 *  names the hoa/* packages they pull in — "hoa/" lists all 16. */
function wallabag(): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", "wallabag_wallabag.json"), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error("wallabag fixture failed to normalize");
  return result.model;
}

function renderIn(ui: ComponentChild, model: Model, state: State) {
  return render(
    <ReportContext.Provider
      value={{
        model,
        state,
        dispatch: vi.fn(),
        now: new Date(model.report.generatedAt),
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
        openGlossaryFrom: vi.fn(),
      }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

function state(overrides: Partial<State>): State {
  return { ...INITIAL_STATE, ...overrides };
}

describe("PD-SEARCH-1: the status line splits a free-text count by where it matched", () => {
  it("counts what is on the row and names the two packages that only mention the word", () => {
    renderIn(<SearchBar inputRef={createRef()} />, wallabag(), state({ q: "hoa/" }));

    const line = screen.getByRole("status").textContent;
    expect(line).toContain("16 of");
    // A single space of its own, so a screen reader does not run "on" into "14" — but no literal
    // "·" glyph any more (PD-SEARCH-1 polish item 1), and no repeated "16" either (item 2): the
    // Findings tab's split total is always the same 16 the line already opened with.
    expect(line).toContain(
      "1 filter on 14 on the row, 2 mention “hoa/” (wallabag/rulerz, wallabag/rulerz-bundle)",
    );
  });

  it("says nothing more when every listed package matched on its own row", () => {
    renderIn(<SearchBar inputRef={createRef()} />, wallabag(), state({ q: "hoa/stream" }));

    expect(screen.getByRole("status").textContent).toBe("1 of 69 flagged package 1 filter on");
  });

  it("splits the All packages tab too, which filters through the same matchesFinding", () => {
    renderIn(<SearchBar inputRef={createRef()} />, wallabag(), state({ view: "packages", q: "hoa/" }));

    expect(screen.getByRole("status").textContent).toContain("14 on the row, 2 mention “hoa/”");
  });

  it("counts packages, not advisory rows, on the Advisories tab", () => {
    renderIn(<SearchBar inputRef={createRef()} />, wallabag(), state({ view: "advisories", q: "11.x" }));

    const line = screen.getByRole("status").textContent;
    expect(line).toContain("2 of 2 advisories");
    expect(line).toContain("1 package matches “11.x”: 1 mentions it (spomky-labs/otphp)");
  });

  it("echoes the query as typed, case kept (PD-SEARCH-1 polish item 4)", () => {
    renderIn(<SearchBar inputRef={createRef()} />, wallabag(), state({ q: "HOA/" }));

    const line = screen.getByRole("status").textContent;
    expect(line).toContain("14 on the row, 2 mention “HOA/”");
    expect(line).not.toContain("hoa/");
  });

  it("keeps the named packages out of what the live region announces (PD-SEARCH-1 polish item 6)", () => {
    const { container } = renderIn(<SearchBar inputRef={createRef()} />, wallabag(), state({ q: "hoa/" }));

    const status = screen.getByRole("status");
    // The names are still on the page — a sighted reader still sees them beside the counts...
    expect(status.textContent).toContain("wallabag/rulerz, wallabag/rulerz-bundle");
    // ...but marked aria-hidden, so a screen reader's announcement of this live region skips them
    // and speaks only the short counts every keystroke actually changes.
    const hiddenNames = container.querySelector('.match-split [aria-hidden="true"]');
    expect(hiddenNames?.textContent).toContain("wallabag/rulerz, wallabag/rulerz-bundle");
  });
});

describe("PD-SEARCH-1: a row found only in its evidence quotes the words around the hit", () => {
  it("Findings: the rulerz rows carry the note, the hoa/* rows do not", () => {
    const { container } = renderIn(<FindingsView />, wallabag(), state({ q: "hoa/" }));

    const rulerz = container.querySelector('[data-pkg="wallabag/rulerz"]');
    const note = rulerz?.querySelector(".match-note");
    expect(note?.textContent).toBe("matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…");
    expect(note?.querySelector("mark")?.textContent).toBe("hoa/");
    expect(container.querySelector('[data-pkg="hoa/compiler"] .match-note')).toBeNull();
    // The row's accessible name is still the package alone.
    expect(rulerz?.getAttribute("aria-label")).toBe("wallabag/rulerz");
  });

  it("Findings: the note carries its own full text as a title (PD-SEARCH-1 polish item 5)", () => {
    const { container } = renderIn(<FindingsView />, wallabag(), state({ q: "hoa/" }));

    const note = container.querySelector('[data-pkg="wallabag/rulerz"] .match-note');
    // The wide ledger clips the note itself to one line with CSS (ledger-rows.css); the title gives
    // a mouse reader the part that clips, and the element's own text — what a screen reader gets —
    // is the same full excerpt either way, never shortened to only the title.
    expect(note?.getAttribute("title")).toBe(
      "matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…",
    );
    expect(note?.textContent).toBe(note?.getAttribute("title"));
  });

  it("Findings: no note without free text, and none for a field-only query", () => {
    const { container } = renderIn(<FindingsView />, wallabag(), state({ q: "verdict:pinned" }));

    expect(container.querySelector(".match-note")).toBeNull();
  });

  it("All packages: the note sits under the package's name", () => {
    const { container } = renderIn(<PackagesView />, wallabag(), state({ view: "packages", q: "hoa/" }));

    const cell = container.querySelector('[data-pkg="wallabag/rulerz-bundle"] td');
    expect(cell?.querySelector(".match-note mark")?.textContent).toBe("hoa/");
  });

  it("Advisories: each row of a package found in its evidence carries the note", () => {
    const { container } = renderIn(<AdvisoriesView />, wallabag(), state({ view: "advisories", q: "11.x" }));

    const notes = container.querySelectorAll(".adv > .match-note");
    expect(notes).toHaveLength(2);
    expect(notes[0]?.textContent).toBe("matched in: 11.x released 11.5.0 (2026-06-06)");
  });
});
