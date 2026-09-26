import type { ComponentChildren } from "preact";
import type { Advisory, Finding, Severity } from "../../model/types";
import {
  advisoryCheckIncomplete,
  allAdvisories,
  fixShapeOf,
  sevTone,
  type AdvisoryGroup,
  type AdvisoryWithFinding,
  type FixShape,
} from "../../domain/advisories";
import {
  axisCaption,
  advisoryRowName,
  fixesOfShape,
  reportedAxis,
  reportedShort,
  reportedSpan,
  reportedYears,
  tallyAdvisories,
  tickLabel,
  type AdvisoryTally,
  type ReportedAxis,
  type SeverityCount,
} from "../../domain/advisoryLedger";
import { useReport } from "../context";
import { population } from "../../domain/filters";
import { cveUrl, safeHref } from "../../domain/links";
import { day, plural } from "../../domain/format";
import { vendorOf } from "../../domain/rows";
import { toneClass } from "../common/common";
import { CleanMark } from "../ledger/CleanMark";
import { CheckIncompleteTag } from "../common/CheckIncompleteTag";
import { firstRows, innerTabIndex, rowTabIndex } from "../rowCursor";
import { openInteractions } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import { advisoryGroupsFor } from "./order";
import { MatchNote, useSearchHit } from "../search/MatchNote";
import "./views.css";
import "./advisories.css";

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function Num({ n }: { n: number }) {
  return <b>{n}</b>;
}

/** A package name in the sentence's own sans, as the Blast radius answer names one. It may wrap
 *  after the slash and nowhere else: never at a hyphen inside the name ("acme/http-" / "client"). */
function Pk({ name }: { name: string }) {
  const vendor = vendorOf(name);
  if (vendor === null) return <span className="al-pk">{name}</span>;
  return (
    <span className="al-pk">
      <span className="al-pk-part">{vendor}/</span>
      <wbr />
      <span className="al-pk-part">{name.slice(vendor.length + 1)}</span>
    </span>
  );
}

/** "a, b and c", each item already a node. */
function joinAnd(items: readonly ComponentChildren[]): ComponentChildren[] {
  return items.flatMap((item, i) => {
    if (i === 0) return [item];
    return [i === items.length - 1 ? " and " : ", ", item];
  });
}

/** "both", "all three", "all 12" — or null for one. */
function allOf(n: number): string | null {
  if (n <= 1) return null;
  if (n === 2) return "both";
  return `all ${SMALL[n] ?? n}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The fix versions quoted verbatim, up to two; past that, how many there are. */
function Versions({ versions }: { versions: readonly string[] }) {
  if (versions.length > 2) {
    return (
      <>
        <Num n={versions.length} /> different releases
      </>
    );
  }
  return (
    <>
      {joinAnd(
        versions.map((v) => (
          <span key={v} className="mono">
            {v}
          </span>
        )),
      )}
    </>
  );
}

/** The packages, by name up to two, else counted. */
function Packages({ names }: { names: readonly string[] }) {
  if (names.length > 2) {
    return (
      <>
        <Num n={names.length} /> packages
      </>
    );
  }
  return <>{joinAnd(names.map((name) => <Pk key={name} name={name} />))}</>;
}

/** "both in production", "all three dev-only", "installed only for development" — one scope
 *  only; the answer splits a list that holds both scopes by severity itself. */
function scopePart(tally: AdvisoryTally): ComponentChildren {
  const { total, production } = tally;
  const all = allOf(total);
  if (production > 0) return all ? `${all} in production` : "in production";
  return all ? <span className="fl-unit">{`${all} dev-only`}</span> : "installed only for development";
}

/** How the advisories are fixed, from each one's own `fixed_by`/`fixed_on_branch`. */
function FixSentence({ tally, pairs }: { tally: AdvisoryTally; pairs: readonly AdvisoryWithFinding[] }) {
  const { total, shapes } = tally;
  const all = allOf(total);
  const one = total === 1;
  if (shapes.branch === total) {
    return (
      <>
        {one ? "It is" : `${capital(all ?? "")} are`} fixed by{" "}
        <Versions versions={fixesOfShape(pairs, "branch")} /> on the branch you are on.
      </>
    );
  }
  if (shapes.move === total) {
    return (
      <>
        {one ? "It is not" : total === 2 ? "Neither is" : "None is"} fixed on the branch you are on;{" "}
        {one ? "it is" : `${all ?? ""} are`} fixed only by <Versions versions={fixesOfShape(pairs, "move")} />
        , on another branch.
      </>
    );
  }
  if (shapes.none === total) {
    return <>No fix is listed for {one ? "it" : total === 2 ? "either" : "any of them"}.</>;
  }
  const parts: ComponentChildren[] = [];
  if (shapes.branch > 0)
    parts.push(
      <span key="b">
        <Num n={shapes.branch} /> {shapes.branch === 1 ? "is" : "are"} fixed on the branch you are on
      </span>,
    );
  if (shapes.move > 0)
    parts.push(
      <span key="m">
        <Num n={shapes.move} /> only on another branch
      </span>,
    );
  if (shapes.none > 0)
    parts.push(
      <span key="n">
        <Num n={shapes.none} /> with no fix listed
      </span>,
    );
  return <>Of them, {joinAnd(parts)}.</>;
}

/** A severity word in its own tone, as the rows below draw it. */
function SeverityWord({ severity }: { severity: Severity }) {
  return <span className={`al-sw ${toneClass(sevTone(severity))}`}>{severity}</span>;
}

/** "1 critical, 2 high and 1 unrated", each count and word one unbreakable unit. */
function SeverityCounts({ tally, counts }: { tally?: AdvisoryTally; counts?: readonly SeverityCount[] }) {
  return (
    <>
      {joinAnd(
        (counts ?? tally?.severities ?? []).map((s) => (
          <span key={s.severity} className="fl-unit">
            <Num n={s.count} /> <SeverityWord severity={s.severity} />
          </span>
        )),
      )}
    </>
  );
}

/** When they were reported, from `reported_at` and the report's own date. */
function AgeSentence({ tally }: { tally: AdvisoryTally }) {
  const { oldestYears, newestYears, total } = tally;
  if (oldestYears === null || newestYears === null) return null;
  const oldest = reportedSpan(oldestYears);
  const newest = reportedSpan(newestYears);
  if (oldest === newest) {
    const who = total === 1 ? "It was" : `${capital(allOf(total) ?? "")} were`;
    return (
      <>
        {" "}
        {who} reported {oldest} ago.
      </>
    );
  }
  return (
    <>
      {" "}
      Reported between {newest} and {oldest} ago.
    </>
  );
}

/** A button to the Run data tab, where the run's own notes are. */
function RunDataLink() {
  const { dispatch } = useReport();
  return (
    <button
      type="button"
      className="pkg-link-btn"
      onClick={() => {
        dispatch({ type: "view", view: "run", keepDetail: true });
      }}
    >
      Run data
    </button>
  );
}

/**
 * Under the answer when the run says its advisory check may not have covered every package
 * (`advisoryCheckIncomplete`: network failures, or a note naming the advisory check): the list
 * above may be partial, in PD-LEDGER-1's own words — a package with no row could not be
 * confirmed clear.
 */
function PartialCheck() {
  return (
    <p className="al-partial">
      <CheckIncompleteTag />{" "}
      <span>
        The advisory check may not have run for every package, so this list may be partial: a package with no
        row here could not be confirmed clear. The run's own notes say why, under <RunDataLink />.
      </span>
    </p>
  );
}

/**
 * The tab's answer, first (PD-ADV-1, DESIGN.md §5): how many advisories on which packages, how many
 * of them in production, how each is fixed and how long ago they were reported — "2 advisories on
 * spomky-labs/otphp, both in production. Neither is fixed on the branch you are on; both are fixed
 * only by 11.5.0, on another branch. Both were reported 4 months ago." Counts and quoted fields
 * only; under a filter the counts are of the matching rows, and it says so.
 */
function AdvisoryAnswer({
  pairs,
  unfiltered,
}: {
  pairs: readonly AdvisoryWithFinding[];
  unfiltered: number;
}) {
  const { now, model } = useReport();
  const tally = tallyAdvisories(pairs, now);
  const partial = advisoryCheckIncomplete(model);
  const narrowed = pairs.length < unfiltered;
  const noun = tally.total === 1 ? "advisory" : "advisories";
  return (
    <div className="al-top">
      <p className="al-answer">
        {tally.total === 1 ? (
          <>
            <Num n={1} /> {narrowed ? "matching " : ""}
            <SeverityWord severity={tally.severities[0]?.severity ?? "unrated"} />
            {tally.severities[0]?.severity === "unrated" ? "" : "-severity"} advisory on{" "}
            <Packages names={tally.packages} />, {scopePart(tally)}.
          </>
        ) : (
          <>
            <Num n={tally.total} /> {narrowed ? `matching ${noun}` : noun} on{" "}
            <Packages names={tally.packages} />
            {tally.dev > 0 && tally.production > 0 ? (
              // Both scopes: each one's own severities, so "is the critical one in production?"
              // is answered in the sentence, not by scanning the rows.
              <>
                : <Num n={tally.production} /> in production (
                <SeverityCounts counts={tally.productionSeverities} />) and{" "}
                <span className="fl-unit">
                  <Num n={tally.dev} /> dev-only
                </span>{" "}
                (<SeverityCounts counts={tally.devSeverities} />
                ).
              </>
            ) : (
              <>
                , by severity <SeverityCounts tally={tally} />, {scopePart(tally)}.
              </>
            )}
          </>
        )}{" "}
        <FixSentence tally={tally} pairs={pairs} />
        <AgeSentence tally={tally} />
      </p>
      {partial && <PartialCheck />}
      {narrowed && (
        <p className="al-scope">
          Only advisories that match the filter are counted; without it there{" "}
          {unfiltered === 1 ? "is" : "are"} <b>{unfiltered}</b>.
        </p>
      )}
    </div>
  );
}

/** A fix-shape group's head: its name, its count and — when the tab holds more than one group, so
 *  the answer above does not already say it — a sentence counting it by severity and quoting its
 *  fix versions. */
function GroupHead({ group, alone }: { group: AdvisoryGroup; alone: boolean }) {
  const { now } = useReport();
  const pairs = group.advisories;
  const tally = tallyAdvisories(pairs, now);
  const fixes = fixesOfShape(pairs, group.shape);
  return (
    <header className="al-group-head">
      <h2>{group.heading}</h2>
      <span className="al-group-count">{plural(pairs.length, "advisory", "advisories")}</span>
      {!alone && (
        <p className="al-group-sentence">
          <SeverityCounts tally={tally} /> on <Packages names={tally.packages} />
          {fixes.length > 0 && (
            <>
              ; fixed by <Versions versions={fixes} />
            </>
          )}
          .
        </p>
      )}
    </header>
  );
}

/** The column head over the rows, sticky, with the reported-ago axis' captions. The words are for
 *  the eye (`aria-hidden`): each row names its own parts. */
function ColumnHead({ axis }: { axis: ReportedAxis | null }) {
  return (
    <div className="al-head" aria-hidden="true">
      <span className="al-col al-col-sev">Severity</span>
      <span className="al-col al-col-adv">Advisory</span>
      <span className="al-col al-col-pkg">Package · reached</span>
      <span className="al-col al-col-aff">Affects</span>
      <span className="al-col al-col-fix">Fixed by</span>
      <span className="al-col al-col-age">
        <span className="al-age-label">{axisCaption(axis)}</span>
        {axis?.ticks.map((tick) => (
          <span
            key={tick}
            className={`al-tick${tick === 0 ? " is-start" : tick === axis.max ? " is-end" : ""}`}
            style={{ left: `${(100 * tick) / axis.max}%` }}
          >
            {tickLabel(tick, axis)}
          </span>
        ))}
      </span>
    </div>
  );
}

const FIX_WHERE: Readonly<Record<FixShape, string>> = {
  branch: "on your branch",
  move: "on another branch",
  none: "no fix listed",
};

/** A package name with its vendor quieter and a wrap point after the slash, as Findings rows draw
 *  it. Under a row that already named the same package (PD-ROWS-5), the whole name goes quiet, as
 *  a repeated value does on a Findings row — still there in full, never a mark to decode. */
function PackageName({ finding, ditto }: { finding: Finding; ditto: boolean }) {
  const vendor = vendorOf(finding.package);
  const name = vendor === null ? finding.package : finding.package.slice(vendor.length + 1);
  return (
    <span className={`ac-name${ditto ? " is-ditto" : ""}`} title={`${finding.package} ${finding.version}`}>
      {vendor !== null && (
        <>
          <span className="ac-vendor">{vendor}/</span>
          <wbr />
        </>
      )}
      <b>{name}</b> <span className="ac-ver">{finding.version}</span>
    </span>
  );
}

function Reach({ finding }: { finding: Finding }) {
  const root = finding.chain[0];
  return (
    <span className="ac-reach">
      {finding.direct || !root ? (
        "direct"
      ) : (
        <>
          <span className="ac-via">via</span> {root}
        </>
      )}
      {finding.dev ? (
        <span className="ac-scope is-dev" title="installed only for development">
          dev
        </span>
      ) : (
        <span className="ac-scope is-prod" title="installed in production">
          prod
        </span>
      )}
    </span>
  );
}

/** The advisory's ids: its CVE linked to NVD, or "no CVE assigned"; its own id linked to the
 *  advisory; the day it was reported. */
function Ids({
  advisory,
  tabIndex,
  ago,
}: {
  advisory: Advisory;
  tabIndex: -1 | undefined;
  ago: string | null;
}) {
  const cve = cveUrl(advisory);
  const link = safeHref(advisory.link);
  const showId = advisory.cve === null || advisory.id !== advisory.cve;
  return (
    <span className="ac-ids">
      {cve !== null ? (
        <a className="ac-id lnk" href={cve} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
          {advisory.cve}
        </a>
      ) : advisory.cve !== null ? (
        <span className="ac-id">{advisory.cve}</span>
      ) : (
        <span className="ac-nocve">no CVE assigned</span>
      )}
      {showId &&
        (link !== null ? (
          <a
            className="ac-id lnk"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={tabIndex}
            title="the advisory"
          >
            {advisory.id}
          </a>
        ) : (
          <span className="ac-id">{advisory.id}</span>
        ))}
      <span className="ac-reported">
        reported {day(advisory.reportedAt)}
        {ago !== null && <span className="ac-ago">, {ago}</span>}
      </span>
    </span>
  );
}

/** The years since it was reported, as a bar on the list's one axis, and the figure beside it. */
function AgeCell({ years, axis }: { years: number | null; axis: ReportedAxis | null }) {
  if (axis === null) return null;
  if (years === null) {
    return (
      <span className="ac-age">
        <span className="ac-age-none">undated</span>
      </span>
    );
  }
  return (
    <span className="ac-age">
      <span className="ac-track">
        {axis.ticks.slice(1, -1).map((tick) => (
          <span key={tick} className="ac-guide" style={{ left: `${(100 * tick) / axis.max}%` }} />
        ))}
        <span className="ac-bar" style={{ width: `${Math.min(100, (100 * years) / axis.max)}%` }} />
      </span>
      <span className="ac-num">{reportedShort(years)}</span>
    </span>
  );
}

interface AdvisoryRowProps {
  readonly finding: Finding;
  readonly advisory: Advisory;
  /** This is the package's first row on the tab: the only one that can be the list's Tab stop. */
  readonly first: boolean;
  /** The row above lists the same package (PD-ROWS-5): its name is drawn quieter. */
  readonly ditto: boolean;
  readonly axis: ReportedAxis | null;
}

/**
 * One advisory, one ledger row (PD-ADV-2, DESIGN.md §5): severity · the advisory (title, CVE or "no
 * CVE assigned", its id, the day it was reported) · the package, how it gets in, prod or dev ·
 * the versions it affects · the release that fixes it and whether that is on your branch · years
 * since it was reported on the list's one axis. Wide, one line under the column head; beside an
 * open package, at a laptop's width and on paper, the fix, the range and the age bar stack in a
 * right-hand column under a slim axis head (PD-ADV-6); on a phone, the severity beside the package,
 * then the advisory, and the range with its fix together at the foot. Named by package, severity
 * and CVE or id (PD-ADV-5): one package can carry several rows.
 */
function AdvisoryRow({ finding, advisory, first, ditto, axis }: AdvisoryRowProps) {
  const { state, dispatch, now, cursor } = useReport();
  const isOpen = state.pkg === finding.package;
  const inner = innerTabIndex(finding.package, cursor, first);
  const hit = useSearchHit(finding);
  const shape = fixShapeOf(advisory);
  const years = reportedYears(advisory, now);

  return (
    <li
      tabIndex={rowTabIndex(finding.package, cursor, first)}
      aria-current={isOpen ? "true" : undefined}
      aria-label={advisoryRowName(finding, advisory)}
      data-pkg={finding.package}
      className={`adv ${toneClass(sevTone(advisory.severity))}`}
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="ac-sev">{advisory.severityRaw ?? "unrated"}</span>
      <span className="ac-title">{advisory.title ?? advisory.id}</span>
      <Ids advisory={advisory} tabIndex={inner} ago={years === null ? null : `${reportedSpan(years)} ago`} />
      <span className="ac-pkg">
        <PackageName finding={finding} ditto={ditto} />
        <Reach finding={finding} />
      </span>
      <span className="ac-aff">
        <span className="ac-lbl">affects </span>
        <span className="mono">{advisory.affectedVersions ?? "?"}</span>
      </span>
      <span className={`ac-fix is-${shape}`}>
        {advisory.fixedBy ? (
          <>
            <span className="ac-lbl">fixed by </span>
            <span className="ac-fixver">{advisory.fixedBy}</span>{" "}
            <span className="ac-where">{FIX_WHERE[shape]}</span>
          </>
        ) : (
          <span className="ac-where">{FIX_WHERE.none}</span>
        )}
      </span>
      <AgeCell years={years} axis={axis} />
      <MatchNote hit={hit} shown={`${advisory.title ?? advisory.id} ${advisory.cve ?? advisory.id}`} />
    </li>
  );
}

function advisoryKey(pair: AdvisoryWithFinding): string {
  return `${pair.finding.package}:${pair.advisory.id}`;
}

/**
 * No advisory in the document at all. PD-LEDGER-1's two sentences, the summary band's own words:
 * a clean check says so with the band's all-clear mark; a check the run says may not have run for
 * every package never reads as clean (`advisoryCheckIncomplete`).
 */
function NoAdvisories() {
  const { model } = useReport();
  if (advisoryCheckIncomplete(model)) {
    const checked = model.report.packagesChecked ?? model.report.findings.length;
    return (
      <div className="empty al-empty">
        <CheckIncompleteTag />
        <p className="al-answer">
          No advisory found; {plural(checked, "package", "packages")} could not be confirmed clear.
        </p>
        <p className="al-scope">
          The run's own notes say why, under <RunDataLink />.
        </p>
      </div>
    );
  }
  return (
    <div className="empty al-empty">
      <p className={`al-answer al-clean ${toneClass("none")}`}>
        <CleanMark size={20} />
        <span>No advisory affects this lock.</span>
      </p>
    </div>
  );
}

/** The Advisories tab: an answer, then every advisory as a ledger row, grouped by what fixing it
 *  takes and most severe first in each group (PD-ADV-1..3, DESIGN.md §5). */
export function AdvisoriesView() {
  const { model, state, now } = useReport();
  const groups = advisoryGroupsFor(model, state);

  if (population(model, "advisories").length === 0) return <NoAdvisories />;
  if (groups.length === 0) return <EmptyState reason="filtered" />;

  const shown = groups.flatMap((group) => group.advisories);
  const first = firstRows(shown, (pair) => pair.finding.package, advisoryKey);
  const oldest = tallyAdvisories(allAdvisories(model), now).oldestYears;
  const axis = reportedAxis(oldest);

  return (
    <div>
      <AdvisoryAnswer pairs={shown} unfiltered={allAdvisories(model).length} />
      <div className={axis ? "aledger" : "aledger no-axis"}>
        <ColumnHead axis={axis} />
        {groups.map((group) => (
          <section className={`advgroup is-${group.shape}`} key={group.shape}>
            <GroupHead group={group} alone={groups.length === 1} />
            <ul className="adv-list" aria-label={group.heading}>
              {group.advisories.map((pair, i) => (
                <AdvisoryRow
                  key={advisoryKey(pair)}
                  finding={pair.finding}
                  advisory={pair.advisory}
                  first={first.has(advisoryKey(pair))}
                  ditto={group.advisories[i - 1]?.finding.package === pair.finding.package}
                  axis={axis}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
