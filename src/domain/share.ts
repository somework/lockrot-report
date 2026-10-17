/** What a printed report says about itself (ui/print/): the running line a printed page repeats
 *  and the sections it carries. */

import type { View } from "../model/types";
import { day } from "./format";

export const DATA_AS_OF = "data as of";

/** Root `data_date` as a day; null means no finding read repository data, so no date is shown. */
export const dataDay = (dataDate: string | null): string => (dataDate === null ? "—" : day(dataDate));

/** The line every printed page repeats at its top: the project, the data date, the lockrot. */
export function runningLine(project: string, dataDate: string, toolVersion: string | null): string {
  return [
    project,
    `${DATA_AS_OF} ${dataDate}`,
    ...(toolVersion !== null ? [`lockrot ${toolVersion}`] : []),
  ].join("  ·  ");
}

/**
 * `text` as a CSS string literal, for a custom property a `@page` margin box's `content` reads
 * (print.css): quotes and backslashes escaped, and any control character — a newline in a project
 * name — written as a CSS hex escape, so the value can never close the string or the declaration.
 */
export function cssString(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is escaped
  const escaped = text.replace(/["\\\u0000-\u001f\u007f]/g, (ch) =>
    ch === '"' || ch === "\\" ? `\\${ch}` : `\\${ch.charCodeAt(0).toString(16)} `,
  );
  return `"${escaped}"`;
}

/** The sections a printed report carries, in order. All packages only when the reader printed
 *  from that tab: 271 rows is a lot of paper to spend unasked. */
export type PrintSection = "summary" | "findings" | "advisories" | "radius" | "run" | "packages";

export function printSections(view: View): readonly PrintSection[] {
  const base: readonly PrintSection[] = ["summary", "findings", "advisories", "radius", "run"];
  return view === "packages" ? [...base, "packages"] : base;
}
