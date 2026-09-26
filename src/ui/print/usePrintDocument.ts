import { h, render, type RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { day } from "../../domain/format";
import { cssString, runningLine } from "../../domain/share";
import type { ReportContextValue } from "../context";
import { PrintDocument } from "./PrintDocument";

/** The custom property print.css's `@page` margin boxes read for the line every page repeats. */
export const RUNNING_HEAD = "--lr-running-head";

/**
 * Mounts the printed report (`PrintDocument`) into `host` for as long as the page prints, and
 * empties it again after. The print is a different document from the screen's tab, so it cannot be
 * a stylesheet over the tab's own DOM — but it is not rendered on screen either: kept there all the
 * time, it would double every row and every `data-pkg` the keyboard and the tests find the screen's
 * rows by.
 *
 * `render()` into `host` is Preact's synchronous top-level render, so the print is in the DOM
 * before the listener returns and the browser lays out the pages: `beforeprint` covers the
 * browser's own Print (Ctrl+P, the menu, the header's "Print / PDF", a headless `page.pdf()`);
 * `matchMedia("print")` covers a print preview or an emulated print medium that fires no
 * `beforeprint`. `host` is a childless element App renders, so App's own diff never touches what
 * is rendered into it.
 *
 * The running line (project, data date, lockrot version) goes on `<html>` as a CSS string through
 * the CSSOM, which the page's CSP allows (DESIGN.md §1.3); `@page` margin boxes inherit custom
 * properties from the root element.
 */
export function usePrintDocument(host: RefObject<HTMLElement>, value: ReportContextValue): void {
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const node = host.current;
    if (node === null) return undefined;
    const root = document.documentElement;
    let mounted = false;

    const mount = (): void => {
      if (mounted) return;
      mounted = true;
      const { model } = latest.current;
      const { run, tool, generatedAt } = model.report;
      const project = run.project ?? run.lockFile ?? "composer.lock";
      root.style.setProperty(RUNNING_HEAD, cssString(runningLine(project, day(generatedAt), tool.version)));
      render(h(PrintDocument, { base: latest.current }), node);
    };
    const unmount = (): void => {
      if (!mounted) return;
      mounted = false;
      render(null, node);
    };

    const query = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const onMedia = (event: MediaQueryListEvent): void => {
      if (event.matches) mount();
      else unmount();
    };
    // After a real print the medium is screen again; under an emulated print medium it is not, and
    // the print stays until the medium changes back.
    const onAfter = (): void => {
      if (query?.matches !== true) unmount();
    };

    window.addEventListener("beforeprint", mount);
    window.addEventListener("afterprint", onAfter);
    query?.addEventListener("change", onMedia);
    if (query?.matches === true) mount();

    return () => {
      window.removeEventListener("beforeprint", mount);
      window.removeEventListener("afterprint", onAfter);
      query?.removeEventListener("change", onMedia);
      unmount();
      root.style.removeProperty(RUNNING_HEAD);
    };
  }, [host]);
}
