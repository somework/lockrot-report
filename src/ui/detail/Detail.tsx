import type { ComponentChildren } from "preact";
import type { ExplainActivity, Finding, PackageDetails } from "../../model/types";
import { isContextOnly } from "../../domain/age";
import { lockTimeLabel, snapshotOf } from "../../domain/pinned";
import { provenance, quietUnread, type ActivitySource, type MetadataSource } from "../../domain/provenance";
import { agePhrase, day } from "../../domain/format";
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

/** The package detail panel, answer before reference (PD-DETAIL-1/6); the lock entry and provenance
 *  fold closed. An unknown `pkg=` gets a small panel that says so, with the same Close. */
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
          snapshot={snapshotOf(finding, details)}
          installedVersion={finding.version}
          ageToned={!isContextOnly(finding)}
        />
        {/* The heading sits inside <summary> so a reader moving by heading still finds it. */}
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
  // A repository link only when `repository_link` checks out again here, else the plain string,
  // never the unsafe link's text. `||`, not `??`: an empty lock string falls back to metadata too.
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
      label: lockTimeLabel(finding, details),
      value: lock?.released ? dated(lock.released, now) : null,
    },
    {
      label: "libyears behind",
      value: <LibyearsRow finding={finding} metadata={metadata} />,
    },
    { label: "repository", value: repository },
    { label: "type", value: lock?.type || metadata?.type || null },
  ]);
}

function FactsLine({
  source,
  rows,
  reason = null,
  where = null,
  from = null,
  note = null,
  id,
}: {
  source: string;
  rows: readonly KeyValueRow[];
  reason?: string | null;
  where?: string | null;
  from?: string | null;
  note?: string | null;
  id?: string;
}) {
  return (
    // tabIndex -1: a strip cell that points here moves focus onto the line itself (SignalList's
    // `reveal`), so a screen reader lands on the facts, not on the section's summary.
    <div className="detail-prov-line" id={id} tabIndex={id === undefined ? undefined : -1}>
      <span className="detail-prov-source">
        {source}
        {where !== null && <span className="detail-prov-where"> · {where}</span>}
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
      {note !== null && <span className="detail-prov-note">{note}</span>}
    </div>
  );
}

/** A value the document does not give, said in words and set apart from a recorded one. */
function Unrecorded({ children }: { children: string }) {
  return <span className="detail-prov-null">{children}</span>;
}

/** A dated fact: its day, then how long before the report that was, spelled out as the fired
 *  checks above word it ("8.2 years ago"). */
function dated(iso: string, now: Date): string {
  return `${day(iso)} · ${agePhrase(iso, now)}`;
}

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

/** Where the panel's facts came from (PD-RUN-5); a source the file gives nothing for says why,
 *  never a bare dash. */
function Provenance({ finding, now }: { finding: Finding; now: Date }) {
  const { model } = useReport();
  const { metadata, activity } = provenance(model, finding);
  const unread = quietUnread(model, finding);
  const note =
    unread === null
      ? null
      : `${unread.ids.join(" and ")} show quiet above, with no repository activity in this file.`;
  // Both sources absent for one reason ("not from a Composer repository"): said once, not twice.
  if (metadata.kind === "missing" && activity.kind === "missing" && metadata.reason === activity.reason) {
    return (
      <div className="detail-prov">
        <FactsLine
          id={ACTIVITY_FACTS_ID}
          source="Package metadata · repository activity"
          rows={[]}
          reason={metadata.reason}
          note={note}
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
          source="Repository activity"
          where={activity.activity.forge}
          rows={activityRows(activity.activity, now)}
        />
      )}
      {activity.kind === "signal" && (
        <FactsLine
          id={ACTIVITY_FACTS_ID}
          source="Repository activity"
          where={activity.host}
          from={fromWords(activity.from)}
          rows={signalActivityRows(activity, now)}
        />
      )}
      {activity.kind === "missing" && (
        <FactsLine
          id={ACTIVITY_FACTS_ID}
          source="Repository activity"
          rows={[]}
          reason={activity.reason}
          note={note}
        />
      )}
    </div>
  );
}

/** None when lockrot read no metadata: an "as of" over absent data would date nothing. */
function metadataRows(source: MetadataSource): readonly KeyValueRow[] {
  if (source.kind === "missing") return [];
  const asOf = { label: "as of", value: source.asOf ? day(source.asOf) : null };
  const { metadata } = source;
  return presentRows([
    { ...asOf, value: asOf.value ?? <Unrecorded>undated</Unrecorded> },
    {
      label: "releases listed",
      value: metadata.releasesListed !== null ? String(metadata.releasesListed) : null,
    },
    {
      label: "newest dated tag",
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
