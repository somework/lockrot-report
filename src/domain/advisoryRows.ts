import type { Finding, S9row } from "../model/report";

/** The counted advisories of a finding: the rows of its S9 signal, none without one. */
export function advisoryRows(finding: Finding): readonly S9row[] {
  const s9 = finding.signals.find(({ id }) => id === "S9");
  return (s9?.data as { advisories?: S9row[] } | undefined)?.advisories ?? [];
}
