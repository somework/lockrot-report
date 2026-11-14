// Each Blast radius tree keeps its own roving Tab stop (ARIA tree pattern, `treeStop`).
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { report2Pages } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import { App } from "../../../src/ui/App";

afterEach(cleanup);

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe("the Blast radius trees (ARIA tree pattern: one Tab stop per tree)", () => {
  function wallabagTrees(hash: string): HTMLElement[] {
    const page = report2Pages().find((p) => p.name === "report2-baselined-wallabag-2.6");
    if (page === undefined) throw new Error("no baselined-wallabag-2.6 page");
    const result = normalize(page.embed);
    if (!result.ok) throw new Error(result.error.message);
    history.replaceState(null, "", `/report.html#view=radius${hash}`);
    render(<App model={result.model} />);
    return [...document.querySelectorAll<HTMLElement>('[data-surface="radius"] [role="tree"]')];
  }

  const stops = (tree: HTMLElement): string[] =>
    [...tree.querySelectorAll<HTMLElement>('[role="treeitem"][tabindex="0"]')].map(
      (item) => item.dataset.pkg ?? "",
    );

  test("gives the one-each tree its own Tab stop, on its first row", () => {
    const [lead, singles] = wallabagTrees("");

    expect(lead === undefined || singles === undefined).toBe(false);
    expect(stops(lead as HTMLElement)).toHaveLength(1);
    expect(stops(singles as HTMLElement)).toEqual([
      singles?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg,
    ]);
  });

  test("keeps a Tab stop in the first tree while the open package sits in the one-each tree", () => {
    const probe = wallabagTrees("");
    const singlesFirst = probe[1]?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg ?? "";
    const leadFirst = probe[0]?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg ?? "";
    cleanup();

    const [lead, singles] = wallabagTrees(`&pkg=${encodeURIComponent(singlesFirst)}`);

    expect(singlesFirst).not.toBe("");
    expect(stops(lead as HTMLElement)).toEqual([leadFirst]);
    expect(stops(singles as HTMLElement)).toEqual([singlesFirst]);
  });

  test("the skip link still moves focus to the open package's row in the one-each tree", () => {
    const probe = wallabagTrees("");
    const singlesFirst = probe[1]?.querySelector<HTMLElement>('[role="treeitem"]')?.dataset.pkg ?? "";
    cleanup();
    wallabagTrees(`&pkg=${encodeURIComponent(singlesFirst)}`);

    fireEvent.click(screen.getByRole("link", { name: "Skip to the list" }));

    expect(document.activeElement?.closest('[role="tree"]')).toBe(
      document.querySelectorAll('[data-surface="radius"] [role="tree"]')[1],
    );
    expect((document.activeElement as HTMLElement | null)?.dataset.pkg).toBe(singlesFirst);
  });
});
