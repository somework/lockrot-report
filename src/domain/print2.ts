/** The printed report of a report-2 (print/PrintDocument.tsx): each section's one line under its
 *  heading, counted from the report-2 populations. */

import type { Report2 } from "../model/report2";
import { noAdvisoryLine } from "./advisories2";
import { plural } from "./format";
import { population2 } from "./list2";
import type { PrintSection } from "./share";

const packages = (n: number): string => plural(n, "package", "packages");

/** Whether a section prints anything under its lede. */
export function printHasBody2(section: PrintSection, report: Report2): boolean {
  if (section === "summary") return report.packages_checked > 0;
  if (section === "findings") return population2(report, "findings").length > 0;
  if (section === "advisories") return population2(report, "advisories").length > 0;
  return true;
}

export function printLede2(section: PrintSection, report: Report2): string | null {
  const checked = report.packages_checked;
  switch (section) {
    case "summary":
      return checked === 0 ? "No packages in this lock." : null;
    case "findings": {
      const n = population2(report, "findings").length;
      if (n > 0)
        return `${plural(n, "flagged package", "flagged packages")}, by grade, each with every flag that fired.`;
      return checked === 0 ? "No packages in this lock." : `Nothing flagged in ${packages(checked)}.`;
    }
    case "advisories":
      return population2(report, "advisories").length > 0 ? null : noAdvisoryLine(report);
    case "radius":
      return population2(report, "radius").length === 0
        ? null
        : "The ranked rows from the top of the tab; the folded groups under them print as their counts.";
    case "run":
      return null;
    case "packages":
      return `Printed because the page was open on All packages: ${packages(report.findings.length)}, in the order the table had them.`;
  }
}
