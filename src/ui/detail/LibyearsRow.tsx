import type { ExplainMetadata, Finding } from "../../model/types";
import { day, fixed } from "../../domain/format";
import { libyearsReason, libyearsRowPhrases } from "../../domain/libyears";
import { Muted, NoWrap } from "../common/common";
import "./detail.css";

type FindingSlice = Pick<Finding, "libyears" | "version" | "note">;
type MetadataSlice = Pick<
  ExplainMetadata,
  | "hasStableRelease"
  | "lastStableRelease"
  | "lastStableVersion"
  | "installedRelease"
  | "installedReleaseDatedBy"
>;

/**
 * The value half of the lock entry's "libyears behind" row — ported from legacy `libyearsRow()`
 * (`report.js:1057-1082`, critic.md M4) as a component instead of pre-escaped HTML. The row itself
 * always renders something (critic.md C6): a package with no `details` entry at all still gets
 * `libyearsReason(finding)`'s explanation, since `metadata` being `null` is just one more reason a
 * value could not be measured.
 */
export function LibyearsRow({
  finding,
  metadata,
}: {
  finding: FindingSlice;
  metadata: MetadataSlice | null;
}) {
  const value = fixed(finding.libyears, 1);
  if (value === null) {
    return <Muted>not measured · {libyearsReason(finding)}</Muted>;
  }

  const phrases = libyearsRowPhrases(finding, metadata);

  return (
    <>
      {value}
      {phrases.map((phrase, index) => (
        // Each phrase is its own muted span, exactly as legacy built them (report.js:1081): a
        // package can carry both the "measured against" phrase and the split-package addendum.
        <Muted key={index}>
          {" "}
          · {phrase.text}
          {phrase.date !== undefined && <NoWrap>{day(phrase.date)}</NoWrap>}
        </Muted>
      ))}
    </>
  );
}
