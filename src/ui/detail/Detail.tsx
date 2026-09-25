import type { ComponentChildren } from "preact";
import type { ExplainMetadata, Finding, PackageDetails } from "../../model/types";
import { ageText, day } from "../../domain/format";
import { safeHref } from "../../domain/links";
import { OutLink } from "../common/common";
import { useReport } from "../context";
import { AdvisoryList } from "./AdvisoryList";
import { DetailHeader } from "./DetailHeader";
import { DetailLead } from "./DetailLead";
import { FollowUpstream } from "./FollowUpstream";
import { KeyValue, presentRows, type KeyValueRow } from "./KeyValue";
import { LibyearsRow } from "./LibyearsRow";
import { PriorityWhy } from "./PriorityWhy";
import { SignalList } from "./SignalList";
import { Timeline } from "./Timeline";
import "./detail.css";

export interface DetailProps {
  readonly onClose: () => void;
}

/**
 * The package detail panel — ported section by section from legacy `renderDetail`
 * (`report.js:737-845`), reordered so the reader meets the answer before the reference (PD-DETAIL-1,
 * DESIGN.md §8; PD-DETAIL-6): the answer sentence with its key facts and how the package gets in,
 * why this priority, follow the upstream (the action, when there is one), against the baseline,
 * every advisory, release branches, signals, then two reference sections — the lock entry and
 * provenance — each a `<details>` closed by default, since a reader who opened the panel to act on
 * it rarely needs the lock's raw fields first.
 *
 * Renders nothing while no package is open (`state.pkg === null`). When `state.pkg` names no
 * finding in this report — an unknown `pkg=` in a pasted link — critic.md's M13 fix applies: a small
 * panel says so, with the same Close action, instead of legacy's narrow-screen scroll lock over a
 * blank aside (`report.js:739`, `DESIGN.md` §5 M13).
 */
export function Detail({ onClose }: DetailProps) {
  const { model, state, now } = useReport();
  if (state.pkg === null) return null;

  const finding = model.report.findings.find((f) => f.package === state.pkg) ?? null;
  if (finding === null) {
    return (
      <aside className="detail" role="complementary" aria-label={state.pkg}>
        <p className="detail-missing">{state.pkg} is not in this report.</p>
        <button type="button" className="detail-close" onClick={onClose}>
          Close
        </button>
      </aside>
    );
  }

  const details = model.details.get(finding.package) ?? null;
  const baselineText = baselineParagraph(finding, model.report.baseline?.path ?? "the baseline");

  return (
    <aside className="detail" role="complementary" aria-label={finding.package}>
      <DetailHeader finding={finding} onClose={onClose} />
      <DetailLead finding={finding} details={details} />
      <div className="detail-body">
        <PriorityWhy finding={finding} />
        <FollowUpstream finding={finding} />
        {baselineText !== null && (
          <section className="detail-section">
            <h3>Against the baseline</h3>
            <p className="detail-baseline">{baselineText}</p>
          </section>
        )}
        <AdvisoryList finding={finding} />
        {/* Keyed by package: a fold opened on one package's timeline must not stay open on the next. */}
        <Timeline
          key={finding.package}
          metadata={details?.metadata ?? null}
          lock={details?.lock ?? null}
          installedVersion={finding.version}
        />
        <SignalList finding={finding} />
        {/* a11y review: a bare <summary> dropped the section's own heading, so a screen-reader
            reader moving by heading found none of these. A <summary> accepts one heading as
            content, so the text moves into an <h3> — the layout (the flex row, the chevron) stays
            on the <summary> itself, restyled to the same look in detail.css's
            `.detail-reference-summary h3`. "How it is reached" used to be a third one; its chain
            now opens the panel, in `DetailLead` (PD-DETAIL-6). */}
        <details className="detail-section detail-reference">
          <summary className="detail-reference-summary">
            <h3>The lock entry</h3>
          </summary>
          <KeyValue rows={lockRows(finding, details, now)} />
        </details>
        <details className="detail-section detail-reference">
          <summary className="detail-reference-summary">
            <h3>Provenance</h3>
          </summary>
          <KeyValue rows={provenanceRows(finding, details?.metadata ?? null)} />
        </details>
      </div>
    </aside>
  );
}

/** "The lock entry": always renders (critic.md C6 — the `installed` row alone guarantees it). */
function lockRows(finding: Finding, details: PackageDetails | null, now: Date): readonly KeyValueRow[] {
  const metadata = details?.metadata ?? null;
  const lock = details?.lock ?? null;
  const safeRepository = safeHref(details?.repositoryLink ?? null);
  // A browsable link when the producer's own repository_link checks out again here (Model's own
  // doc comment: "the page re-checks it before linking"); otherwise the plain repository string
  // the lock or the metadata carries, exactly as legacy fell back (report.js:766-768) — never the
  // unsafe link's text.
  // `||`, not `??`, on every lock/metadata fallback below: legacy compared these by truthiness
  // (`report.js:763, 766, 768-769`), so an empty-string lock value — not just a missing one — falls
  // back to metadata the same way a `null`/`undefined` one does (parity fix, alongside
  // `presentRows` dropping "" outright).
  const repository: ComponentChildren =
    safeRepository !== null ? (
      <OutLink href={safeRepository}>{safeRepository}</OutLink>
    ) : (
      lock?.repository || metadata?.repository || null
    );

  return presentRows([
    { label: "installed", value: finding.version },
    { label: "php constraint", value: lock?.php || null },
    {
      label: "released",
      value: lock?.released ? `${day(lock.released)} · ${ageText(lock.released, now)}` : null,
    },
    { label: "libyears behind", value: <LibyearsRow finding={finding} metadata={metadata} /> },
    { label: "repository", value: repository },
    { label: "type", value: lock?.type || metadata?.type || null },
  ]);
}

/** "Provenance": always renders (critic.md C6 — `day()` never returns an empty string, so the
 *  `metadata` row alone guarantees it). */
function provenanceRows(finding: Finding, metadata: ExplainMetadata | null): readonly KeyValueRow[] {
  return presentRows([
    { label: "metadata", value: day(metadata?.dataDate ?? finding.dataDate) },
    {
      label: "releases listed",
      value: metadata && metadata.releasesListed !== null ? String(metadata.releasesListed) : null,
    },
    {
      label: "last stable",
      value: metadata?.lastStableVersion
        ? `${metadata.lastStableVersion} · ${day(metadata.lastStableRelease)}`
        : null,
    },
  ]);
}

/** "Against the baseline": omitted entirely for a finding the baseline says nothing about — ported
 *  from legacy's `bstate` branch (`report.js:798-803`). */
function baselineParagraph(finding: Finding, baselinePath: string): ComponentChildren | null {
  const baseline = finding.baseline;
  if (baseline === null) return null;

  if (baseline.status === "new") {
    return `Not in ${baselinePath}. This one is new since it was written.`;
  }
  if (baseline.status === "worsened") {
    return (
      <>
        The baseline recorded <span className="mono">{baseline.previousVerdict ?? "a milder verdict"}</span>.
        It has got worse since.
      </>
    );
  }

  return `Already accepted in ${baselinePath}. It does not fail the build.`;
}
