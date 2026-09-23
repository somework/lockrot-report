// The IIFE entry point (DESIGN.md §1.2): evaluating this file must, with no further call from an
// embedder, define `window.LockrotReport` and autoboot a filled `#lockrot-data` tag into
// `#lockrot-app`. This file stays plain TypeScript (not `.tsx`) and calls Preact's `h()` directly
// rather than writing JSX, since JSX needs the file extension `.tsx` to get the jsx transform.
import { h, render } from "preact";

import { normalize, parseBundle } from "./model/normalize";
import { App } from "./ui/App";
import { ErrorScreen } from "./ui/ErrorScreen";

// Inferred from `parseBundle`'s own return type rather than redeclared here, so this file stays in
// sync with whatever `model/normalize.ts` actually exports instead of a second, hand-copied shape.
type ParseResult = ReturnType<typeof parseBundle>;

function renderResult(target: Element, result: ParseResult): void {
  render(result.ok ? h(App, { model: result.model }) : h(ErrorScreen, { error: result.error }), target);
}

export interface MountHandle {
  update(bundle: unknown): void;
  unmount(): void;
}

/**
 * The lifecycle an embedder should use (DESIGN.md §1.2), as opposed to autoboot's write-then-load
 * contract: `bundle` is an already-parsed value (e.g. `JSON.parse`d or handed over by
 * `postMessage`), so this normalises it directly rather than re-parsing text.
 */
export function mount(target: Element, bundle: unknown): MountHandle {
  renderResult(target, normalize(bundle));
  return {
    update(next: unknown): void {
      renderResult(target, normalize(next));
    },
    unmount(): void {
      // Preact's documented way to tear down a tree it owns: rendering `null` where a vnode used
      // to be removes everything mount() put there, leaving the container empty again.
      render(null, target);
    },
  };
}

/** Exposed for an embedder that already has raw text and wants the parse result on its own. */
export function parse(text: string): ParseResult {
  return parseBundle(text);
}

declare const __LOCKROT_REPORT_VERSION__: string;
export const version: string = __LOCKROT_REPORT_VERSION__;

export interface LockrotReportApi {
  version: string;
  mount: typeof mount;
  parse: typeof parse;
}

declare global {
  interface Window {
    LockrotReport?: LockrotReportApi;
  }
}

/**
 * Autoboot (DESIGN.md §1.2): the old embedding contract — write the payload into `#lockrot-data`,
 * then load this script, with no further JS call — has to keep working, so booting is a side
 * effect of evaluating the bundle. A missing or whitespace-only data island means there is nothing
 * to render yet (an embedder that means to call `mount()` itself), not an error.
 */
function autoboot(): void {
  const dataEl = document.getElementById("lockrot-data");
  const appEl = document.getElementById("lockrot-app");
  if (!dataEl || !appEl) return;
  // `Node#textContent`'s getter is typed as always returning `string` (never `null`) for an
  // element, not just `Document`/`DocumentType` — no `?? ""` fallback needed here.
  const text = dataEl.textContent;
  if (text.trim() === "") return;
  renderResult(appEl, parseBundle(text));
}

window.LockrotReport = { version, mount, parse };
autoboot();
