import type { ExplainMetadata, Finding } from "../../model/types";
import { day, fixed } from "../../domain/format";
import { libyearsReason, libyearsRowPhrases, unmeasuredWords } from "../../domain/libyears";
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
export function LibyearsRow({ finding, metadata }: { finding: Finding; metadata: MetadataSlice | null }) {
  const value = fixed(finding.libyears, 1);
  if (value === null) {
    const code = finding.libyearsUnmeasured;
    if (code !== null && unmeasuredWords(code) === null) {
      return (
        <Muted>
          not measured · <code className="mono">{code}</code>
        </Muted>
      );
    }
    const why = libyearsReason(finding);
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
