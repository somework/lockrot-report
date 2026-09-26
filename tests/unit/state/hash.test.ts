import { describe, expect, it } from "vitest";
import { HashSync, parseHash, serializeHash } from "../../../src/state/hash";
import type { HashWindow } from "../../../src/state/hash";
import { EMPTY_FILTERS, INITIAL_STATE } from "../../../src/state/types";
import type { State } from "../../../src/state/types";

/**
 * A fake `window` exposing only what `HashSync.writeHash` touches, so the latch and the URL it
 * writes can be asserted without jsdom/happy-dom. `replaceState` mutates the fake location's hash
 * the way a real browser would, so a second `writeHash` call sees what the first one wrote.
 */
function fakeWindow(opts: { pathname?: string; search?: string; hash?: string } = {}): {
  win: HashWindow;
  calls: Array<string | URL | null | undefined>;
} {
  const location = {
    pathname: opts.pathname ?? "/report.html",
    search: opts.search ?? "",
    hash: opts.hash ?? "",
  };
  const calls: Array<string | URL | null | undefined> = [];
  const history = {
    replaceState(_data: unknown, _title: string, url?: string | URL | null): void {
      calls.push(url);
      const s = url == null ? "" : String(url);
      const hashIndex = s.indexOf("#");
      location.hash = hashIndex >= 0 ? s.slice(hashIndex) : "";
    },
  };
  return { win: { location, history } as unknown as HashWindow, calls };
}

function throwingWindow(hash = ""): { win: HashWindow } {
  const location = { pathname: "/report.html", search: "", hash };
  const history = {
    replaceState(): void {
      throw new DOMException("opaque origin", "SecurityError");
    },
  };
  return { win: { location, history } as unknown as HashWindow };
}

describe("serializeHash", () => {
  it("produces an empty string for the initial state", () => {
    // Arrange / Act
    const h = serializeHash(INITIAL_STATE);

    // Assert
    expect(h).toBe("");
  });

  it("writes view unencoded when it is not the default findings tab", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, view: "packages" };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("view=packages");
  });

  it("omits view when it is findings, even if other fields are set", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, view: "findings", q: "abc" };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h.startsWith("view=")).toBe(false);
  });

  it("URI-encodes a query", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, q: "a b&c" };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("q=" + encodeURIComponent("a b&c"));
  });

  it("does not write a whitespace-only query (DESIGN.md §4 fix)", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, q: "   " };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("");
  });

  it("writes filter groups in FILTER_GROUPS order regardless of which was toggled first", () => {
    // Arrange
    const state: State = {
      ...INITIAL_STATE,
      filters: { ...EMPTY_FILTERS, since: ["30d"], prio: ["high"], verdict: ["stale", "silent"] },
    };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("prio=high&verdict=stale%2Csilent&since=30d");
  });

  it("joins multiple selected keys with a comma before encoding", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, verdict: ["stale", "silent"] } };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("verdict=" + encodeURIComponent("stale,silent"));
  });

  it("writes pkg whenever a package is open: the page never opens one by itself (PD-ROWS-9)", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, pkg: "acme/widget" };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("pkg=acme%2Fwidget");
  });

  it("omits pkg when no package is open", () => {
    // Arrange
    const state: State = { ...INITIAL_STATE, view: "findings", pkg: null };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("");
  });

  it("assembles every piece in the documented order", () => {
    // Arrange
    const state: State = {
      ...INITIAL_STATE,
      view: "advisories",
      q: "curl",
      filters: { ...EMPTY_FILTERS, prio: ["high"], sev: ["critical"] },
      pkg: "acme/widget",
    };

    // Act
    const h = serializeHash(state);

    // Assert
    expect(h).toBe("view=advisories&q=curl&prio=high&sev=critical&pkg=acme%2Fwidget");
  });
});

describe("parseHash", () => {
  it("returns base unchanged for an empty fragment", () => {
    // Arrange
    const base: State = { ...INITIAL_STATE, q: "kept" };

    // Act
    const next = parseHash("", base);

    // Assert
    expect(next).toBe(base);
  });

  it("strips a leading #", () => {
    // Arrange / Act
    const next = parseHash("#view=packages", INITIAL_STATE);

    // Assert
    expect(next.view).toBe("packages");
  });

  it("round-trips serializeHash output back to an equivalent state", () => {
    // Arrange
    const state: State = {
      ...INITIAL_STATE,
      view: "advisories",
      q: "curl",
      filters: { ...EMPTY_FILTERS, prio: ["high"], sev: ["critical"] },
      pkg: "acme/widget",
    };

    // Act
    const h = serializeHash(state);
    const restored = parseHash(h, INITIAL_STATE);

    // Assert
    expect(restored.view).toBe(state.view);
    expect(restored.q).toBe(state.q);
    expect(restored.filters).toEqual(state.filters);
    expect(restored.pkg).toBe(state.pkg);
  });

  it("skips a piece with no = silently", () => {
    // Arrange / Act
    const next = parseHash("view=packages&garbage&q=x", INITIAL_STATE);

    // Assert
    expect(next.view).toBe("packages");
    expect(next.q).toBe("x");
  });

  it("skips a piece whose value fails to decodeURIComponent, without blanking the rest (fixes M12)", () => {
    // Arrange: a lone `%` is not a valid escape sequence.
    // Act
    const next = parseHash("q=%&view=packages", INITIAL_STATE);

    // Assert
    expect(next.view).toBe("packages");
    expect(next.q).toBe(INITIAL_STATE.q);
  });

  it("ignores an unknown view instead of falling through to a different tab", () => {
    // Arrange / Act
    const next = parseHash("view=bogus", INITIAL_STATE);

    // Assert
    expect(next.view).toBe(INITIAL_STATE.view);
  });

  it("assigns q verbatim, decoded", () => {
    // Arrange / Act
    const next = parseHash("q=" + encodeURIComponent("a b&c"), INITIAL_STATE);

    // Assert
    expect(next.q).toBe("a b&c");
  });

  it("sets pkg, decoded, over whatever base had open", () => {
    // Arrange
    const base: State = { ...INITIAL_STATE, pkg: "other/pkg" };

    // Act
    const next = parseHash("pkg=acme%2Fwidget", base);

    // Assert
    expect(next.pkg).toBe("acme/widget");
  });

  it("adds comma-separated keys to a filter group, skipping empty segments", () => {
    // Arrange / Act
    const next = parseHash("verdict=stale,,silent", INITIAL_STATE);

    // Assert
    expect(next.filters.verdict).toEqual(["stale", "silent"]);
  });

  it("merges filter keys additively onto whatever base already had, without duplicating", () => {
    // Arrange
    const base: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, prio: ["high"] } };

    // Act
    const next = parseHash("prio=high,critical", base);

    // Assert
    expect(next.filters.prio).toEqual(["high", "critical"]);
  });

  it("keeps an unrecognised key within a known group as a harmless string", () => {
    // Arrange / Act
    const next = parseHash("prio=nonsense", INITIAL_STATE);

    // Assert
    expect(next.filters.prio).toEqual(["nonsense"]);
  });

  it("ignores a top-level key that is not view, q, pkg, or a filter group", () => {
    // Arrange / Act
    const next = parseHash("bogus=1&view=packages", INITIAL_STATE);

    // Assert
    expect(next.view).toBe("packages");
    expect((next as unknown as Record<string, unknown>)["bogus"]).toBeUndefined();
  });

  it("leaves sort and sortDesc untouched — they are not part of the fragment format", () => {
    // Arrange
    const base: State = { ...INITIAL_STATE, sort: "libyears", sortDesc: true };

    // Act
    const next = parseHash("view=packages", base);

    // Assert
    expect(next.sort).toBe("libyears");
    expect(next.sortDesc).toBe(true);
  });
});

describe("HashSync.writeHash", () => {
  it("writes the serialized fragment with a leading #", () => {
    // Arrange
    const { win, calls } = fakeWindow();
    const sync = new HashSync();
    const state: State = { ...INITIAL_STATE, view: "packages" };

    // Act
    sync.writeHash(state, win);

    // Assert
    expect(calls).toEqual(["#view=packages"]);
  });

  it("falls back to pathname + search when the fragment is empty (DESIGN.md §4 fix)", () => {
    // Arrange
    const { win, calls } = fakeWindow({ pathname: "/report.html", search: "?x=1", hash: "#view=packages" });
    const sync = new HashSync();

    // Act
    sync.writeHash(INITIAL_STATE, win);

    // Assert
    expect(calls).toEqual(["/report.html?x=1"]);
  });

  it("never calls pushState — only replaceState exists on the fake and is the only call recorded", () => {
    // Arrange
    const { win, calls } = fakeWindow();
    const sync = new HashSync();

    // Act
    sync.writeHash({ ...INITIAL_STATE, q: "abc" }, win);

    // Assert
    expect(calls).toHaveLength(1);
  });

  it("does not write when the computed fragment already matches the address bar", () => {
    // Arrange
    const { win, calls } = fakeWindow({ hash: "#view=packages" });
    const sync = new HashSync();

    // Act
    sync.writeHash({ ...INITIAL_STATE, view: "packages" }, win);

    // Assert
    expect(calls).toEqual([]);
  });

  it("writes again once the state actually changes", () => {
    // Arrange
    const { win, calls } = fakeWindow();
    const sync = new HashSync();

    // Act
    sync.writeHash({ ...INITIAL_STATE, view: "packages" }, win);
    sync.writeHash({ ...INITIAL_STATE, view: "packages" }, win); // no-op, unchanged
    sync.writeHash({ ...INITIAL_STATE, view: "radius" }, win);

    // Assert
    expect(calls).toEqual(["#view=packages", "#view=radius"]);
  });

  it("permanently disables writing after the first thrown error", () => {
    // Arrange
    const { win } = throwingWindow();
    const sync = new HashSync();

    // Act
    sync.writeHash({ ...INITIAL_STATE, view: "packages" }, win);
    // A second call with a different, real (non-throwing) window must still be a no-op: the latch
    // is permanent for the life of the HashSync instance, not tied to one particular window.
    const { win: win2, calls: calls2 } = fakeWindow();
    sync.writeHash({ ...INITIAL_STATE, view: "radius" }, win2);

    // Assert
    expect(calls2).toEqual([]);
  });

  it("a fresh HashSync instance is not affected by another instance's latch", () => {
    // Arrange
    const { win } = throwingWindow();
    const tripped = new HashSync();
    tripped.writeHash({ ...INITIAL_STATE, view: "packages" }, win);

    const fresh = new HashSync();
    const { win: win2, calls: calls2 } = fakeWindow();

    // Act
    fresh.writeHash({ ...INITIAL_STATE, view: "radius" }, win2);

    // Assert
    expect(calls2).toEqual(["#view=radius"]);
  });
});
