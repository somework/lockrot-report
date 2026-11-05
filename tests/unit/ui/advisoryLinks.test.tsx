// One link rule (R12-22) as the detail sheet draws it: the Security list and the verdict line link
// the source id only, and a different CVE id is text.
import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { newTab } from "../../../src/domain/rich";
import { normalize } from "../../../src/model/normalize";
import type { Report2Embed, S9row } from "../../../src/model/report";
import { App } from "../../../src/ui/App";

const LINK = "https://github.com/advisories/GHSA-v5mv-p594-2x33";
const CVE = "CVE-2026-69246";
const SOURCE = "PKSA-gcrk-3vtt-1r14";

type Ids = Pick<S9row, "cve" | "id" | "link">;

const CASES: readonly (readonly [string, Ids, readonly (readonly [string, string])[]])[] = [
  ["cve differs from id", { cve: CVE, id: SOURCE, link: LINK }, [[SOURCE, LINK]]],
  ["cve equals id", { cve: CVE, id: CVE, link: LINK }, [[CVE, LINK]]],
  ["cve is null", { cve: null, id: SOURCE, link: LINK }, [[SOURCE, LINK]]],
  ["link is null", { cve: CVE, id: SOURCE, link: null }, []],
  ["link is unsafe", { cve: CVE, id: SOURCE, link: "javascript:alert(1)" }, []],
];

function openDeciding(ids: Ids): HTMLElement {
  const embed: Report2Embed = assembleEmbed("B");
  const finding = embed.report.findings[0];
  const rows = (finding?.signals.find(({ id }) => id === "S9")?.data as { advisories: S9row[] }).advisories;
  const at = rows.findIndex((row) => row.deciding);
  rows[at] = { ...(rows[at] as S9row), ...ids };
  history.replaceState(null, "", `/report.html#pkg=${encodeURIComponent(finding?.package ?? "")}`);
  const result = normalize(embed);
  if (!result.ok) throw new Error(result.error.message);
  render(<App model={result.model} />);
  const sheet = document.querySelector<HTMLElement>('[data-surface="detail"]');
  if (sheet === null) throw new Error("no detail sheet");
  return sheet;
}

const links = (
  scope: Element | null | undefined,
): (readonly [string | null, string | null, string | null])[] =>
  [...(scope?.querySelectorAll<HTMLAnchorElement>("a[target=_blank]") ?? [])].map((a) => [
    a.textContent,
    a.getAttribute("href"),
    a.getAttribute("aria-label"),
  ]);

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("the deciding advisory on the detail sheet", () => {
  test.each(CASES)("the Security list, %s", (_name, ids, expected) => {
    const sheet = openDeciding(ids);
    const head = [...sheet.querySelectorAll(".d3-adv-head")].find((h) => h.querySelector(".d3-rung-mark"));

    expect(links(head)).toEqual(expected.map(([text, href]) => [text, href, newTab(text)]));
    expect(head?.textContent).toContain(
      [ids.cve, ids.id].filter((id, at, all) => id !== null && all.indexOf(id) === at).join(" "),
    );
  });

  test.each(CASES)("the verdict line, %s", (_name, ids, expected) => {
    const sheet = openDeciding(ids);
    const row = sheet.querySelector(".d3-verdict");

    expect(links(row)).toEqual(expected.map(([text, href]) => [text, href, newTab(text)]));
    expect(
      [...sheet.querySelectorAll(".d3-verdict-line, .d3-reading-text")].map((p) => p.textContent),
    ).toContainEqual(
      expect.stringContaining(
        [ids.cve, ids.id].filter((id, at, all) => id !== null && all.indexOf(id) === at).join(" "),
      ),
    );
  });
});
