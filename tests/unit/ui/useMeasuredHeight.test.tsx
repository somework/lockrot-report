import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMeasuredHeight } from "../../../src/ui/useMeasuredHeight";

const VAR = "--list-head-h";
const root = (): string => document.documentElement.style.getPropertyValue(VAR);

/** Measures each element at the height its `data-h` names, once, when it is observed. */
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this);
  }
  disconnect(): void {}
  unobserve(): void {}
}

function Head({ h }: { h: number }) {
  const ref = useMeasuredHeight<HTMLDivElement>(VAR);
  return <div ref={ref} data-h={h} />;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { height: Number(this.dataset["h"] ?? 0) } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(VAR);
});

describe("useMeasuredHeight", () => {
  test("publishes the ceiling of the element's height on the root", () => {
    render(<Head h={62.4} />);
    expect(root()).toBe("63px");
  });

  test("removes the height when its one owner unmounts", () => {
    const { unmount } = render(<Head h={40} />);
    unmount();
    expect(root()).toBe("");
  });

  test("keeps the next owner's height when the old owner's cleanup runs after the next owner's set", () => {
    const old = render(<Head h={40} />);
    const next = render(<Head h={63} />);
    old.unmount();
    expect(root()).toBe("63px");
    next.unmount();
    expect(root()).toBe("");
  });
});
