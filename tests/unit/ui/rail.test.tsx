import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChild } from "preact";
import { assembleEmbed } from "../../../scripts/report2-embed";
import type { Action, State } from "../../../src/state/types";
import { INITIAL_STATE } from "../../../src/state/types";
import type { Report2Embed } from "../../../src/model/report";
import type { Model } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";
import { ReportContext } from "../../../src/ui/context";
import { Rail } from "../../../src/ui/rail/Rail";

afterEach(cleanup);

function toModel(embed: Report2Embed): Model {
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** 7 graded findings, none dev: 6 direct and 1 transitive, 7 in `require`, 1 not named in composer.json.
 *  The run fails the gate on 5 of them. No baseline. */
const composite = () => toModel(assembleEmbed("composite"));

const wallabagBaselined = () =>
  toModel(
    JSON.parse(
      readFileSync(
        join(process.cwd(), ".lockrot/tests/fixtures/baselined/wallabag-2.6/check/report.bundle.json"),
        "utf8",
      ),
    ) as Report2Embed,
  );

function renderIn(
  ui: ComponentChild,
  model: Model,
  state: State,
  dispatch: (action: Action) => void = vi.fn(),
) {
  return render(
    <ReportContext.Provider
      value={{
        model,
        state,
        dispatch,
        now: new Date(model.report.generated_at),
        wide: true,
        cursor: null,
        openGlossary: vi.fn(),
      }}
    >
      {ui}
    </ReportContext.Provider>,
  );
}

function buttonTexts(): string[] {
  return screen.getAllByRole("button").map((button) => button.textContent.replace(/\s+/g, " ").trim());
}

describe("Rail", () => {
  it("renders nothing when the current tab has no population to filter", () => {
    const { container } = renderIn(<Rail />, composite(), { ...INITIAL_STATE, view: "run" });

    expect(container.textContent).toBe("");
  });

  it("offers This run, Flag, Severity, Fix and Scope in that order, each row with the packages it would list", () => {
    renderIn(<Rail />, composite(), INITIAL_STATE);

    // Gate: `gate.failing` is 5. Flags: the document's carriers, `silent` carried by none so left out.
    // Severity and Fix count packages, not advisories: SPEC §7.9.4's "By fix (packages)" reads
    // composer update 2, upgrade 1, php floor raise 1.
    // Scope: `rot_depth` has 6 direct, 1 transitive, 7 production, 0 development, 1 not in composer.json.
    expect(buttonTexts()).toEqual([
      "Fails this run 5",
      "abandoned 1",
      "pinned 1",
      "left-behind 1",
      "old-promise 3",
      "stale 2",
      "vulnerable 4",
      "critical 1",
      "high 2",
      "medium 1",
      "unrated 1",
      "low 3",
      "composer update 2",
      "upgrade 1",
      "php floor raise 1",
      "Direct 6",
      "Transitive 1",
      "require 7",
      "not in composer.json 1",
    ]);
  });

  it("offers no This run row for a run that fails nothing", () => {
    renderIn(<Rail />, toModel(assembleEmbed("B-gate-none")), INITIAL_STATE);

    expect(screen.queryByRole("button", { name: /^Fails this run/ })).toBeNull();
  });

  it("dispatches a toggle of the group and key when a row is clicked", () => {
    const dispatch = vi.fn();
    renderIn(<Rail />, composite(), INITIAL_STATE, dispatch);

    fireEvent.click(screen.getByRole("button", { name: /^Transitive /i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "toggle", group: "scope", key: "transitive" });
    fireEvent.click(screen.getByRole("button", { name: /^old-promise /i }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "toggle", group: "flag", key: "old-promise" });
  });

  it("marks a selected row pressed and leaves the others unpressed", () => {
    const state: State = { ...INITIAL_STATE, filters: { ...INITIAL_STATE.filters, scope: ["transitive"] } };

    renderIn(<Rail />, composite(), state);

    expect(screen.getByRole("button", { name: /^Transitive /i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^require /i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("says so when the search leaves nothing for a row to add", () => {
    renderIn(<Rail />, composite(), { ...INITIAL_STATE, q: "no-such-package" });

    expect(screen.getByText("Nothing here narrows the list further.")).toBeTruthy();
  });

  it("offers Hide accepted flags only for a document with an accepted flag, and toggles it", () => {
    const dispatch = vi.fn();
    renderIn(<Rail />, toModel(assembleEmbed("B-accepted-dagger")), INITIAL_STATE, dispatch);

    // B-accepted: one finding, with accepted maintenance flags on it.
    fireEvent.click(screen.getByRole("button", { name: "Hide accepted flags 1" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", group: "accepted", key: "hide" });
    cleanup();

    renderIn(<Rail />, composite(), INITIAL_STATE);
    expect(screen.queryByRole("button", { name: /^Hide accepted flags/ })).toBeNull();
  });
});

describe("Rail on a document with a baseline", () => {
  it("titles the Since group with the baseline's own path, apart from the capitalised eyebrow", () => {
    renderIn(<Rail />, wallabagBaselined(), INITIAL_STATE);

    const title = screen.getByText("lockrot-baseline.json", { selector: ".rail-path" });
    expect(title.parentElement?.textContent).toBe("Since lockrot-baseline.json");
  });

  it("counts the graded findings in each baseline state", () => {
    renderIn(<Rail />, wallabagBaselined(), INITIAL_STATE);

    // Of the document's 112 graded findings: 61 new, 6 worsened, 45 known (the root `baseline.known`
    // of 47 also counts two ungraded `ok` packages).
    expect(screen.getByRole("button", { name: "New 61" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Worsened 6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Known 45" })).toBeTruthy();
  });

  it("puts Fails this run under the Since eyebrow, not under an eyebrow of its own", () => {
    renderIn(<Rail />, wallabagBaselined(), INITIAL_STATE);

    // 46 is `gate.failing` of the document.
    const fails = screen.getByRole("button", { name: "Fails this run 46" });
    expect(fails.closest(".rail-group")?.querySelector(".rail-path")).not.toBeNull();
    expect(screen.queryByText("This run")).toBeNull();
  });
});
