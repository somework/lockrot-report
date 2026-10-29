import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import { normalize } from "../../../src/model/normalize";
import type { Model } from "../../../src/model/types";
import { App } from "../../../src/ui/App";

function composite(): Model {
  const result = normalize(assembleEmbed("composite"));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

/** The footer's observer, run by hand: `show(true)` is the footer scrolling into view. */
function stubObserver(): (isIntersecting: boolean) => void {
  let callback: IntersectionObserverCallback = () => undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
  return (isIntersecting) => {
    callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  };
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: /1000px|1024px/.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    run(0);
    return 0;
  });
  history.replaceState(null, "", "/report.html#view=findings");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// WCAG 2.4.11: the footer shortens the sticky rail, which can leave the focused control under it.
describe("the footer coming into view", () => {
  test("brings a focused control of the rail back into view", () => {
    const show = stubObserver();
    render(<App model={composite()} />);
    const button = document.querySelector<HTMLElement>(".shell-rail button");
    if (button === null) throw new Error("no rail button");
    const scroll = vi.fn();
    button.scrollIntoView = scroll;
    button.focus();

    show(true);

    expect(document.documentElement.classList.contains("footer-in-view")).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  test("leaves focus outside the sticky columns where it is", () => {
    const show = stubObserver();
    render(<App model={composite()} />);
    const row = document.querySelector<HTMLElement>("[data-pkg]");
    if (row === null) throw new Error("no row");
    const scroll = vi.fn();
    row.scrollIntoView = scroll;
    row.focus();

    show(true);

    expect(scroll).not.toHaveBeenCalled();
  });
});
