import type { ComponentChildren } from "preact";
import type { ExplainActivity, Finding, PackageDetails } from "../../model/types";
import { isContextOnly } from "../../domain/age";
import { provenance, type ActivitySource, type MetadataSource } from "../../domain/provenance";
import { ageText, day } from "../../domain/format";
import { safeHref } from "../../domain/links";
import { OutLink } from "../common/common";
import { useReport } from "../context";
import { AdvisoryList } from "./AdvisoryList";
import { BaselineStanding } from "./BaselineStanding";
import { DetailHeader } from "./DetailHeader";
import { DetailLead } from "./DetailLead";
import { FollowUpstream } from "./FollowUpstream";
import { KeyValue, presentRows, type KeyValueRow } from "./KeyValue";
import { LibyearsRow } from "./LibyearsRow";
import { PriorityWhy } from "./PriorityWhy";
import { ACTIVITY_FACTS_ID, SignalList } from "./SignalList";
import { Timeline } from "./Timeline";
import "./detail.css";

export interface DetailProps {
  readonly onClose: () => void;
}

/**
 * The package detail panel — ported section by section from legacy `renderDetail`
 * (`report.js:737-845`), reordered so the reader meets the answer before the reference (PD-DETAIL-1,
 * DESIGN.md §8; PD-DETAIL-6): the answer sentence with its key facts and how the package gets in,
 * against the baseline (PD-BASELINE-3: first, when the run had one), why this priority, then the
 * checks behind the verdict (PD-DETAIL-12: the two "why" blocks side by side), follow the upstream
 * (the action, when there is one), every advisory,
 * release branches, then two reference sections — the lock entry and
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
        <button type="button" className="detail-close" onClick={onClose} data-detail-focus="">
          Close
        </button>
      </aside>
    );
  }

  const details = model.details.get(finding.package) ?? null;

  return (
    <aside className="detail" role="complementary" aria-label={finding.package}>
      <DetailHeader finding={finding} onClose={onClose} />
      <DetailLead finding={finding} details={details} />
      <div className="detail-body">
        <BaselineStanding finding={finding} />
        <PriorityWhy finding={finding} />
        <SignalList finding={finding} />
        <FollowUpstream finding={finding} />
        <AdvisoryList finding={finding} />
        {/* Keyed by package: a fold opened on one package's timeline must not stay open on the next. */}
        <Timeline
          key={finding.package}
          metadata={details?.metadata ?? null}
          lock={details?.lock ?? null}
          installedVersion={finding.version}
          ageToned={!isContextOnly(finding)}
        />
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
        <details className="detail-section detail-reference" id="detail-provenance">
          <summary className="detail-reference-summary">
            <h3>Provenance</h3>
          </summary>
          <Provenance finding={finding} now={now} />
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

/** A source's facts as one flowing line: its name (and, when the facts are borrowed, where from),
 *  then each label and value, "·" between them, then — when the file gives none — why, in words. */
function FactsLine({
  source,
  rows,
  reason = null,
  from = null,
  id,
}: {
  source: ComponentChildren;
  rows: readonly KeyValueRow[];
  reason?: string | null;
  from?: string | null;
  id?: string;
}) {
  return (
    // tabIndex -1: a strip cell that points here moves focus onto the line itself (SignalList's
    // `reveal`), so a screen reader lands on the facts, not on the section's summary.
    <div className="detail-prov-line" id={id} tabIndex={id === undefined ? undefined : -1}>
      <span className="detail-prov-source">
        {source}
        {from !== null && <span className="detail-prov-from"> {from}</span>}
      </span>
      {rows.length > 0 && (
        <dl className="detail-kv detail-prov-facts">
          {rows.map((row) => (
            <div className="detail-prov-fact" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {reason !== null && <span className="detail-prov-reason">{reason}</span>}
    </div>
  );
}

/** A value the document does not give, said in words and set apart from a recorded one. */
function Unrecorded({ children }: { children: string }) {
  return <span className="detail-prov-null">{children}</span>;
}

/** A dated fact: its day, then how long before the report that was. */
function dated(iso: string, now: Date): string {
  return `${day(iso)} · ${ageText(iso, now)}`;
}

/** The repository activity lockrot read for this package (PD-RUN-5): where, whether archived, the
 *  last push and how long before the report that was, and when it was fetched — fresh or from
 *  lockrot's cache. */
function activityRows(activity: ExplainActivity, now: Date): readonly KeyValueRow[] {
  return presentRows([
    { label: "repository", value: activity.repository },
    { label: "archived", value: activity.archived ? "yes" : "no" },
    {
      label: "last push",
      value: activity.pushedAt ? dated(activity.pushedAt, now) : <Unrecorded>none recorded</Unrecorded>,
    },
    {
      label: "fetched",
      value: activity.fetchedAt ? (
        `${day(activity.fetchedAt)} · ${activity.fromCache ? "from lockrot’s cache" : "during this run"}`
      ) : (
        <Unrecorded>
          {activity.fromCache ? "from lockrot’s cache, date not recorded" : "not recorded"}
        </Unrecorded>
      ),
    },
  ]);
}

/** The same facts as a fired S3/S4 check carries them, when the file holds no activity block. */
function signalActivityRows(
  source: Extract<ActivitySource, { kind: "signal" }>,
  now: Date,
): readonly KeyValueRow[] {
  return presentRows([
    { label: "repository", value: source.repository },
    {
      label: "archived",
      value: source.archived === null ? null : source.archived ? "yes (S3 fired)" : "no (S3 quiet)",
    },
    { label: "last push", value: source.lastPush ? dated(source.lastPush, now) : null },
    { label: "fetched", value: <Unrecorded>not in this document</Unrecorded> },
  ]);
}

/** "S4’s data", "S3’s and S4’s data". */
function fromWords(ids: readonly string[]): string {
  return `from ${ids.map((id) => `${id}’s`).join(" and ")} data`;
}

/**
 * "Provenance" (PD-RUN-5, DESIGN.md §5): where the panel's facts came from, as compact lines — the
 * package metadata (its date, releases listed, last stable) and the repository activity from the
 * forge, or the same facts as a fired S3/S4 carries them. A source the file gives nothing for says
 * why (`domain/provenance.ts`) — never a bare dash. The strip's quiet S3/S4 cells point at the
 * activity line.
 */
function Provenance({ finding, now }: { finding: Finding; now: Date }) {
  const { model } = useReport();
  const { metadata, activity } = provenance(model, finding);
  // Both sources absent for one reason ("not from a Composer repository"): said once, not twice.
  if (
    metadata.kind === "missing" &&
    activity.kind === "missing" &&
    metadata.asOf === null &&
    metadata.reason === activity.reason
  ) {
    return (
      <div className="detail-prov">
        <FactsLine
          id={ACTIVITY_FACTS_ID}
          source="Package metadata · repository activity"
          rows={[]}
          reason={metadata.reason}
        />
      </div>
    );
  }
  return (
    <div className="detail-prov">
      <FactsLine
        source="Package metadata"
        rows={metadataRows(metadata)}
        reason={metadata.kind === "missing" ? metadata.reason : null}
      />
      {activity.kind === "read" && (
        <FactsLine
          id={ACTIVITY_FACTS_ID}
          source={activity.activity.forge ?? "Repository activity"}
          rows={activityRows(activity.activity, now)}
        />
      )}
      {activity.kind === "signal" && (
        <FactsLine
          id={ACTIVITY_FACTS_ID}
          source={activity.host ?? "Repository activity"}
          from={fromWords(activity.from)}
          rows={signalActivityRows(activity, now)}
        />
      )}
      {activity.kind === "missing" && (
        <FactsLine id={ACTIVITY_FACTS_ID} source="Repository activity" rows={[]} reason={activity.reason} />
      )}
    </div>
  );
}

/** The metadata line's facts: its date, releases listed and last stable when lockrot read it; only
 *  the finding's own date (when it has one) when it did not. */
function metadataRows(source: MetadataSource): readonly KeyValueRow[] {
  const asOf = { label: "as of", value: source.asOf ? day(source.asOf) : null };
  if (source.kind === "missing") return presentRows([asOf]);
  const { metadata } = source;
  return presentRows([
    { ...asOf, value: asOf.value ?? <Unrecorded>undated</Unrecorded> },
    {
      label: "releases listed",
      value: metadata.releasesListed !== null ? String(metadata.releasesListed) : null,
    },
    {
      label: "last stable",
      value: metadata.lastStableVersion ? (
        metadata.lastStableRelease ? (
          `${metadata.lastStableVersion} · ${day(metadata.lastStableRelease)}`
        ) : (
          <>
            {metadata.lastStableVersion} · <Unrecorded>undated</Unrecorded>
          </>
        )
      ) : null,
    },
  ]);
}
