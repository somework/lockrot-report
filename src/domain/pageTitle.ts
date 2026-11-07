import type { Run } from "../model/report";

/** The name the page heads itself with. */
export const projectName = ({ project, lock_file }: Pick<Run, "project" | "lock_file">): string =>
  project ?? lock_file ?? "composer.lock";

/** A view's document title: what a browser tab shows first leads, so several open reports stay
 *  apart. `base` is the title the page was written with, kept last. */
export function pageTitle(base: string, tab: string, project: string, pkg: string | null): string {
  return [pkg, tab, project, base.trim()].filter((part) => part !== null && part !== "").join(" · ");
}
