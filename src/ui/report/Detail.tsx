import type { ComponentChildren } from "preact";
import { useId, useRef } from "preact/hooks";
import type { DetailsEntry, Finding } from "../../model/report";
import { ageLine, ageNotRead } from "../../domain/ageLine";
import { answerText } from "../../domain/findingAnswer";
import { baselineSuffix } from "../../domain/baselineSuffix";
import { branchesLine } from "../../domain/branchesLine";
import { verdictTone } from "../../domain/findingRow";
import { checkReasonWords } from "../../domain/findingWords";
import { checksLine } from "../../domain/checksLine";
import { agesAsOf, DETAIL_WORDS, detailReach, REFERENCE_WORDS } from "../../domain/detailWords";
import { feedsLine } from "../../domain/feedsLine";
import { day } from "../../domain/format";
import { safeHref } from "../../domain/links";
import { HIDE_ACCEPTED, hiddenByFilters2 } from "../../domain/list";
import { repositoryLine } from "../../domain/repositoryLine";
import { OutLink, toneClass } from "../common/common";
import { useReport } from "../context";
import { KeyValue, presentRows, type KeyValueRow } from "../detail/KeyValue";
import { BranchTimeline2 } from "./BranchTimeline";
import { CopyMove } from "./CopyMove";
import { FlagPills } from "./FlagPills";
import { ScoreWhy } from "./ScoreWhy";
import { SecurityRow2 } from "./SecurityRow";
import { useReport2 } from "./useReport";
import "../detail/detail.css";
import "./detail.css";

function Row({ label, children, id }: { label: string; children: ComponentChildren; id?: string }) {
  return (
    <div className="d2-row" id={id}>
      <h3 className="d2-row-label">{label}</h3>
      <div className="d2-row-value">{children}</div>
    </div>
  );
}

function lockRows(finding: Finding, entry: DetailsEntry | null): readonly KeyValueRow[] {
  const lock = entry?.lock ?? null;
  const link = safeHref(entry?.repository_link ?? null);
  return presentRows([
    { label: REFERENCE_WORDS.installed, value: finding.version },
    { label: REFERENCE_WORDS.php, value: lock?.php ?? null },
    {
      // A branch snapshot's lock time is its commit's date, which is no release (PD-S6-3).
      label: lock?.branch_snapshot ? REFERENCE_WORDS.snapshotDated : REFERENCE_WORDS.released,
      value: lock?.released ? day(lock.released) : null,
    },
    {
      label: REFERENCE_WORDS.repository,
      value: link !== null ? <OutLink href={link}>{link}</OutLink> : (lock?.repository ?? null),
    },
    { label: REFERENCE_WORDS.type, value: lock?.type ?? null },
    { label: REFERENCE_WORDS.dev, value: finding.dev ? REFERENCE_WORDS.yes : null },
    { label: REFERENCE_WORDS.snapshot, value: lock?.branch_snapshot ? REFERENCE_WORDS.yes : null },
  ]);
}

function provenanceRows(finding: Finding, entry: DetailsEntry | null): readonly KeyValueRow[] {
  const { origin, metadata, activity } = finding;
  const status = (id: string, reason: string | null): string =>
    reason === null ? id : `${id} (${checkReasonWords(finding, reason)})`;
  return presentRows([
    { label: REFERENCE_WORDS.origin, value: origin.kind },
    { label: REFERENCE_WORDS.registry, value: origin.registry },
    { label: REFERENCE_WORDS.local, value: origin.local ? REFERENCE_WORDS.yes : null },
    { label: REFERENCE_WORDS.metadata, value: status(metadata.status, metadata.reason) },
    {
      label: REFERENCE_WORDS.metadataAsOf,
      value: entry?.metadata?.data_date ? day(entry.metadata.data_date) : null,
    },
    {
      label: REFERENCE_WORDS.releases,
      value: entry?.metadata ? String(entry.metadata.releases_listed) : null,
    },
    { label: REFERENCE_WORDS.activity, value: status(activity.status, activity.reason) },
    { label: REFERENCE_WORDS.fetched, value: activity.fetched_at ? day(activity.fetched_at) : null },
    { label: REFERENCE_WORDS.cached, value: activity.cached_at ? day(activity.cached_at) : null },
  ]);
}

function Reference({ title, rows }: { title: string; rows: readonly KeyValueRow[] }) {
  return (
    <details className="detail-section detail-reference">
      <summary className="detail-reference-summary">
        <h3>{title}</h3>
      </summary>
      <KeyValue rows={rows} />
    </details>
  );
}

function Sheet({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const { state, dispatch } = useReport();
  const { report, details } = useReport2();
  // `dispatch` unmounts the Clear-filters button, so focus goes to Close, which every state keeps.
  const closeRef = useRef<HTMLButtonElement>(null);
  const branchesId = `${useId()}-branches`;
  const entry = details[finding.package] ?? null;
  const metadata = entry?.metadata ?? null;
  const { run } = report;
  const feeds = feedsLine(finding);
  const branches = branchesLine(finding, metadata);
  const age = ageLine(finding, metadata);
  const notRead = ageNotRead(finding, metadata);
  const baseline = baselineSuffix(finding, run);

  return (
    <aside className="detail d2" role="complementary" aria-label={finding.package} data-surface="detail">
      <div className="detail-head">
        <div className="detail-head-top">
          <div className="detail-head-name">
            <h2 className="detail-title" tabIndex={-1} data-detail-focus="">
              {finding.package}
            </h2>
            <span className="detail-version">{finding.version}</span>
          </div>
          <span className={`pill ${toneClass(verdictTone(run.score_model, finding.verdict))}`}>
            {finding.verdict}
          </span>
          <button type="button" ref={closeRef} className="detail-close" onClick={onClose}>
            {DETAIL_WORDS.close}
          </button>
        </div>
        <div className="detail-head-line">
          <span className="d2-pills">
            <FlagPills
              finding={finding}
              run={run}
              hideAccepted={state.filters.accepted.includes(HIDE_ACCEPTED)}
            />
          </span>
          <span className="d2-reach">{detailReach(finding)}</span>
        </div>
        {hiddenByFilters2(report, state, finding.package) && (
          <p className="detail-hidden-note">
            {DETAIL_WORDS.hidden}
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                dispatch({ type: "clear" });
                closeRef.current?.focus();
              }}
            >
              {DETAIL_WORDS.clearFilters}
            </button>
          </p>
        )}
      </div>
      <div className="detail-body d2-body">
        <div className="d2-lead">
          <p className="d2-asof">{agesAsOf(report.generated_at)}</p>
          <p className="d2-answer">{answerText(finding, run)}</p>
          <CopyMove key={finding.package} argvs={finding.next_step?.commands ?? []} />
        </div>
        <ScoreWhy finding={finding} report={report} />
        <div className="d2-rows">
          <Row label={DETAIL_WORDS.checks}>
            <p className="d2-row-text">{checksLine(finding, run)}</p>
          </Row>
          <Row label={DETAIL_WORDS.security}>
            <SecurityRow2 finding={finding} run={run} metadata={metadata} />
          </Row>
          {feeds !== null && (
            <Row label={DETAIL_WORDS.feeds}>
              <p className="d2-row-text">{feeds}</p>
            </Row>
          )}
          {branches !== null && (
            <Row label={DETAIL_WORDS.branches}>
              <p className="d2-row-text" id={branchesId}>
                {branches}
              </p>
              <BranchTimeline2
                key={finding.package}
                finding={finding}
                metadata={metadata}
                run={run}
                summaryId={branchesId}
              />
            </Row>
          )}
          {age !== null && (
            <Row label={DETAIL_WORDS.age}>
              <p className="d2-row-text">{age}</p>
              {notRead.length > 0 && <p className="d2-row-text d2-row-note">{notRead.join(" · ")}</p>}
            </Row>
          )}
          <Row label={DETAIL_WORDS.repository}>
            <p className="d2-row-text">{repositoryLine(finding)}</p>
          </Row>
          {baseline !== null && (
            <Row label={DETAIL_WORDS.baseline}>
              <p className="d2-row-text">{baseline}</p>
            </Row>
          )}
        </div>
        <Reference title={DETAIL_WORDS.lockEntry} rows={lockRows(finding, entry)} />
        <Reference title={DETAIL_WORDS.provenance} rows={provenanceRows(finding, entry)} />
      </div>
    </aside>
  );
}

/** The detail sheet of a report-2 document (SPEC §7.9.8). An unknown `pkg=` gets a panel that says
 *  so, with the same Close. */
export function Detail2({ onClose }: { onClose: () => void }) {
  const { state } = useReport();
  const { report } = useReport2();
  if (state.pkg === null) return null;

  const finding = report.findings.find((f) => f.package === state.pkg);
  if (finding === undefined) {
    return (
      <aside className="detail d2" role="complementary" aria-label={state.pkg} data-surface="detail">
        <p className="detail-missing">{state.pkg} is not in this report.</p>
        <button type="button" className="detail-close" onClick={onClose} data-detail-focus="">
          {DETAIL_WORDS.close}
        </button>
      </aside>
    );
  }
  return <Sheet key={finding.package} finding={finding} onClose={onClose} />;
}
