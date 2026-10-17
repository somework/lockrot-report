import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import type { DetailsEntry, Finding } from "../../model/report";
import { ageRows } from "../../domain/ageRows";
import { baselineSuffix } from "../../domain/baselineSuffix";
import { branchesLead } from "../../domain/branchTimeline";
import { verdictTone } from "../../domain/findingRow";
import { checkReasonWords } from "../../domain/findingWords";
import { checksItems } from "../../domain/checksLine";
import { DETAIL_WORDS, detailReach, REFERENCE_WORDS } from "../../domain/detailWords";
import { feedsLine } from "../../domain/feedsLine";
import { day } from "../../domain/format";
import { headerLinks, safeHref } from "../../domain/links";
import { HIDE_ACCEPTED, hiddenByFilters2 } from "../../domain/list";
import { moveCards } from "../../domain/moveCards";
import { repositoryLine } from "../../domain/repositoryLine";
import { advisoryRows } from "../../domain/advisoryRows";
import { OutLink, toneClass } from "../common/common";
import { useReport } from "../context";
import { usePrinted } from "../print/printContext";
import { KeyValue, presentRows, type KeyValueRow } from "../detail/KeyValue";
import { BranchTimeline2 } from "./BranchTimeline";
import { FlagPills } from "./FlagPills";
import { HeldBy, MoveCard } from "./MoveCard";
import type { JumpIds } from "./RichText";
import { ScoreWhy } from "./ScoreWhy";
import { SecurityRow2 } from "./SecurityRow";
import { useReport2 } from "./useReport";
import { VerdictBlock } from "./VerdictBlock";
import "../detail/detail.css";
import "./detail.css";
import "./sheet.css";

function Row({
  label,
  children,
  id,
  wide = false,
}: {
  label: string;
  children: ComponentChildren;
  id?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "d2-row d3-row-wide" : "d2-row"} id={id}>
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
  const printed = usePrinted();
  return (
    <details className="detail-section detail-reference" open={printed ? true : undefined}>
      <summary className="detail-reference-summary">
        <h3>{title}</h3>
      </summary>
      <KeyValue rows={rows} />
    </details>
  );
}

/** Paper opens every `details` of the sheet, and the screen gets each one's state back after it. */
function usePrintOpen(root: { current: HTMLElement | null }): void {
  useEffect(() => {
    const was = new Map<HTMLDetailsElement, boolean>();
    const open = (): void => {
      for (const details of root.current?.querySelectorAll("details") ?? []) {
        was.set(details, details.open);
        details.open = true;
      }
    };
    const restore = (): void => {
      for (const [details, isOpen] of was) details.open = isOpen;
      was.clear();
    };
    window.addEventListener("beforeprint", open);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", open);
      window.removeEventListener("afterprint", restore);
    };
  }, [root]);
}

/** Below the wide layout the sheet covers the page and the rest is inert, so it is a modal dialog to
 *  assistive technology; beside the list it is a complementary column. */
function useSheetRole(): { role: "dialog" | "complementary"; "aria-modal"?: "true" } {
  const { wide } = useReport();
  const printed = usePrinted();
  return wide || printed ? { role: "complementary" } : { role: "dialog", "aria-modal": "true" };
}

function Sheet({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const { state, dispatch } = useReport();
  const sheetRole = useSheetRole();
  const { report, details } = useReport2();
  // `dispatch` unmounts the Clear-filters button, so focus goes to Close, which every state keeps.
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  usePrintOpen(sheetRef);
  const base = useId();
  const branchesId = `${base}-branches`;
  const securityId = `${base}-security`;
  const entry = details[finding.package] ?? null;
  const metadata = entry?.metadata ?? null;
  const { run } = report;
  const feeds = feedsLine(finding);
  const lead = branchesLead(finding, metadata);
  const age = ageRows(finding, metadata);
  const baseline = baselineSuffix(finding, run);
  const cards = moveCards(finding, run);
  const hasAdvisories = advisoryRows(finding).length > 0;
  const jumps: JumpIds = {
    ...(lead.length > 0 ? { branches: branchesId } : {}),
    ...(hasAdvisories ? { security: securityId } : {}),
  };
  const reach = finding.flags.length === 0 ? detailReach(finding, run) : null;
  const links = headerLinks(finding, entry?.repository_link ?? null);

  return (
    <div
      ref={sheetRef}
      className="detail d2 d3"
      {...sheetRole}
      aria-label={finding.package}
      data-surface="detail"
    >
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
          <span className="d2-meta">
            {reach !== null && <span className="d2-reach">{reach}</span>}
            {links.map((link, i) => (
              <Fragment key={link.href}>
                {(reach !== null || i > 0) && " · "}
                <OutLink href={link.href} label={link.name}>
                  {link.text}
                </OutLink>
              </Fragment>
            ))}
          </span>
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
      <div className="detail-body d2-body d3-body">
        <VerdictBlock
          finding={finding}
          run={run}
          metadata={metadata}
          generatedAt={report.generated_at}
          jumps={jumps}
        />
        {cards.map((card, i) => (
          <Fragment key={i}>
            <MoveCard card={card} run={run} />
            {card.heldBy !== null && <HeldBy block={card.heldBy} />}
          </Fragment>
        ))}
        <ScoreWhy finding={finding} report={report} />
        <div className="d2-rows">
          <Row label={DETAIL_WORDS.checks}>
            <ul className="d3-lines">
              {checksItems(finding, run).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Row>
          <Row label={DETAIL_WORDS.security} id={securityId} wide={hasAdvisories}>
            <SecurityRow2 finding={finding} run={run} metadata={metadata} id={securityId} />
          </Row>
          {feeds !== null && (
            <Row label={DETAIL_WORDS.feeds}>
              <p className="d2-row-text">{feeds}</p>
            </Row>
          )}
          {lead.length > 0 && (
            <section className="d2-branches" aria-labelledby={`${branchesId}-head`}>
              <h3 className="d2-row-label" id={`${branchesId}-head`}>
                {DETAIL_WORDS.branches}
              </h3>
              <p className="d2-branches-line d3-branches-lead" id={branchesId}>
                {lead.join(" ")}
              </p>
              <BranchTimeline2
                key={finding.package}
                finding={finding}
                metadata={metadata}
                run={run}
                summaryId={branchesId}
                headId={`${branchesId}-head`}
              />
            </section>
          )}
          {age.length > 0 && (
            <Row label={DETAIL_WORDS.age} wide>
              <dl className="d3-kv">
                {age.flatMap(({ label, value }) =>
                  label === null
                    ? []
                    : [
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>,
                      ],
                )}
              </dl>
              {age.some(({ label }) => label === null) && (
                <ul className="d3-lines d2-row-note">
                  {age.flatMap(({ label, value }) => (label === null ? [<li key={value}>{value}</li>] : []))}
                </ul>
              )}
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
    </div>
  );
}

/** The detail sheet of a report-2 document (SPEC §7.9.8). An unknown `pkg=` gets a panel that says
 *  so, with the same Close. */
export function Detail2({ onClose }: { onClose: () => void }) {
  const { state } = useReport();
  const { report } = useReport2();
  const sheetRole = useSheetRole();
  if (state.pkg === null) return null;

  const finding = report.findings.find((f) => f.package === state.pkg);
  if (finding === undefined) {
    return (
      <div className="detail d2" {...sheetRole} aria-label={state.pkg} data-surface="detail">
        <p className="detail-missing">{state.pkg} is not in this report.</p>
        <button type="button" className="detail-close" onClick={onClose} data-detail-focus="">
          {DETAIL_WORDS.close}
        </button>
      </div>
    );
  }
  return <Sheet key={finding.package} finding={finding} onClose={onClose} />;
}
