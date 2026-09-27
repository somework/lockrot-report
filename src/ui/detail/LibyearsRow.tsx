import type { ExplainMetadata, Finding, PackageDetails } from "../../model/types";
import { day, fixed } from "../../domain/format";
import { libyearsReason, libyearsRowPhrases } from "../../domain/libyears";
import { Muted, NoWrap } from "../common/common";
import "./detail.css";

type MetadataSlice = Pick<
  ExplainMetadata,
  | "hasStableRelease"
  | "lastStableRelease"
  | "lastStableVersion"
  | "installedRelease"
  | "installedReleaseDatedBy"
>;

/** The value half of the lock entry's "libyears behind" row; it always says something. */
export function LibyearsRow({
  finding,
  details,
  metadata,
}: {
  finding: Finding;
  details: PackageDetails | null;
  metadata: MetadataSlice | null;
}) {
  const value = fixed(finding.libyears, 1);
  if (value === null) {
    const why = libyearsReason(finding, details);
    return <Muted>{why === "" ? "not measured" : `not measured · ${why}`}</Muted>;
  }

  const phrases = libyearsRowPhrases(finding, metadata);

  return (
    <>
      {value}
      {phrases.map((phrase, index) => (
        <Muted key={index}>
          {" "}
          · {phrase.text}
          {phrase.date !== undefined && <NoWrap>{day(phrase.date)}</NoWrap>}
        </Muted>
      ))}
    </>
  );
}
