import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import type { ExplainMetadata, Finding, PackageDetails } from "../../model/types";
import { ageText, day } from "../../domain/format";
import { safeHref } from "../../domain/links";
import { OutLink } from "../common/common";
import { useReport } from "../context";
import { AdvisoryList } from "./AdvisoryList";
import { DetailHeader } from "./DetailHeader";
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
 * DESIGN.md §8): follow the upstream (the action, when there is one), against the baseline, why this
 * priority, every advisory, release branches, signals, then three reference sections — how it is
 * reached, the lock entry, provenance — each a `<details>` closed by default, since a reader who
 * opened the panel to act on it rarely needs the lock's raw fields first.
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
  // `finding.chain` already ends with the finding's own package (Model's own doc comment: "Direct
  // requirement → … → this package"; contract.md confirms `direct === (chain.length === 1)`) — a
  // direct finding's chain is just `[finding.package]`, which legacy's `.concat([f.package])` would
  // have doubled had it been ported literally, so the direct branch replaces it with the literal
  // "composer.json" instead of appending onto it.
  const chain = finding.direct ? ["composer.json", finding.package] : finding.chain;

  return (
    <aside className="detail" role="complementary" aria-label={finding.package}>
      <DetailHeader finding={finding} onClose={onClose} />
      <div className="detail-body">
        <FollowUpstream finding={finding} />
        {baselineText !== null && (
          <section className="detail-section">
            <h3>Against the baseline</h3>
            <p className="detail-baseline">{baselineText}</p>
          </section>
        )}
        <PriorityWhy finding={finding} />
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
            reader moving by heading found none of these three. A <summary> accepts one heading as
            content, so the text moves into an <h3> — the layout (the flex row, the chevron) stays
            on the <summary> itself, restyled to the same look in detail.css's
            `.detail-reference-summary h3`. */}
        <details className="detail-section detail-reference">
          <summary className="detail-reference-summary">
            <h3>How it is reached</h3>
          </summary>
          <p className="detail-chain">
            {chain.map((pkg, index) => (
              <Fragment key={pkg}>
                {index > 0 && " → "}
                <span className="mono">{pkg}</span>
              </Fragment>
            ))}
          </p>
        </details>
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
