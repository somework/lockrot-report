import type { Finding } from "../../model/types";
import type { RadiusReceipt, RadiusRow, TreeNode } from "../../domain/radius";
import { pulledTree } from "../../domain/radius";
import type { AgeAxis } from "../../domain/age";
import { ageNotRead, ageScale } from "../../domain/age";
import { plural } from "../../domain/format";
import { rowSignals, shortFact } from "../../domain/rows";
import { SIGNAL_DEFS, TONE, VERDICT_DEFS } from "../../domain/vocab";
import { Tag, toneClass } from "../common/common";
import { useReport } from "../context";
import { innerTabIndex, rowTabIndex } from "../rowCursor";
import { AgeCell, AgeCellEmpty } from "./AgeScale";
import { openInteractions } from "./FindingRow";
import {
  AgeSpread,
  groupByListing,
  joined,
  KeepDates,
  PkgName,
  PullsSentence,
  Squares,
  VerdictWord,
} from "./RadiusMarks";

/** Jumps to the row that lists `packages` and marks them there (`RadiusView`'s `jump`). */
export type Jump = (under: string, packages: readonly string[]) => void;

/** What every row of the tab needs from the view around it. */
export interface RowEnv {
  readonly axis: AgeAxis | null;
  /** Row keys that are their package's first visible row: the one that may be the Tab stop. */
  readonly first: ReadonlySet<string>;
  readonly jump: Jump;
  /** The packages marked after a jump, under the row they were jumped to. */
  readonly flash: { readonly under: string; readonly packages: readonly string[] } | null;
}

export const parentKey = (pkg: string): string => `p:${pkg}`;
export const childKey = (parent: string, pkg: string): string => `c:${parent}:${pkg}`;
export const receiptKey = (pkg: string): string => `r:${pkg}`;

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  );
}

/** "+1 more it reaches, listed under symfony/security-bundle" — the row named is a button that
 *  jumps there and marks the packages it lists for this row. */
function AlsoLine({ row, tabIndex, env }: { row: RadiusRow; tabIndex: -1 | undefined; env: RowEnv }) {
  if (row.elsewhere.length === 0) return null;
  const lead =
    row.count > 0
      ? `+${plural(row.elsewhere.length, "more it reaches", "more it reaches")}, listed under `
      : `Reaches ${plural(row.elsewhere.length, "flagged package", "flagged packages")}, listed under `;
  return (
    <span className="rl-also">
      {lead}
      {joined(
        groupByListing(row.elsewhere).map(({ under, packages }) =>
          under === null ? (
            <span key="none">no row</span>
          ) : (
            <button
              key={under}
              type="button"
              className="rl-jump"
              tabIndex={tabIndex}
              title={`Go to ${under}'s row: ${packages.join(", ")}`}
              onClick={() => {
                env.jump(under, packages);
              }}
            >
              {under}
            </button>
          ),
        ),
      )}
    </span>
  );
}

interface ParentProps {
  readonly row: RadiusRow;
  /** 1-based place in the ranking, or null for a tail row. */
  readonly rank: number | null;
  /** The row's own packages can be shown under it (ranked rows; a tail row lists none). */
  readonly expandable: boolean;
  readonly open: boolean;
  readonly env: RowEnv;
}

/**
 * One direct requirement (PD-RADIUS-1): rank · the requirement, its version, "dev", "<verdict>
 * itself" · its squares · what it pulls in · their years since release · a toggle. A click anywhere
 * on it opens the requirement's own detail — the same one a Findings row opens; the toggle, and a
 * click on the squares, show the packages it lists underneath as a chain tree.
 */
export function ParentRow({ row, rank, expandable, open, env }: ParentProps) {
  const { model, state, dispatch, cursor } = useReport();
  const key = parentKey(row.package);
  const first = env.first.has(key);
  const inner = innerTabIndex(row.package, cursor, first);
  const kidsId = `rl-kids-${row.package.replace(/[^a-z0-9_-]/gi, "_")}`;
  const canOpen = expandable && row.count > 0;
  const toggle = () => {
    dispatch({ type: "disclose", key: `row:${row.package}`, open: !open });
  };
  const flash = env.flash?.under === row.package ? env.flash.packages : [];

  return (
    <li
      tabIndex={rowTabIndex(row.package, cursor, first)}
      aria-current={state.pkg === row.package ? "true" : undefined}
      aria-label={row.package}
      data-pkg={row.package}
      className={open && canOpen ? "rrow is-open" : "rrow"}
      {...openInteractions(row.package, dispatch)}
    >
      <div className="rr-line">
        <span className="rr-rank" aria-hidden="true">
          {rank ?? ""}
        </span>
        <span className="rr-pkg fcell" title={row.version ? `${row.package} ${row.version}` : row.package}>
          <span className="rr-name">
            <PkgName name={row.package} />
          </span>
          {row.version && <span className="fc-ver">{row.version}</span>}
          {row.dev && (
            <span className="fc-dev" title="installed only for development">
              dev
            </span>
          )}
          {row.self && (
            <Tag
              tone={TONE(row.self.verdict)}
              title={`this direct requirement is itself flagged: ${row.self.verdict} — ${
                VERDICT_DEFS[row.self.verdict] ?? ""
              }`}
            >
              {row.self.verdict} itself
            </Tag>
          )}
        </span>
        <Squares row={row} onToggle={canOpen ? toggle : null} />
        <span className="rr-say">
          {row.count > 0 ? (
            <PullsSentence row={row} />
          ) : row.elsewhere.length === 0 ? (
            <span className="rl-quiet">Nothing flagged is listed under it.</span>
          ) : null}
          <AlsoLine row={row} tabIndex={inner} env={env} />
        </span>
        <AgeSpread
          findings={row.count > 0 ? row.pulled : row.self ? [row.self] : []}
          axis={env.axis}
          thresholds={model.report.run.thresholds}
        />
        <span className="rr-tog">
          {canOpen && (
            <button
              type="button"
              className="rl-chev"
              aria-expanded={open ? "true" : "false"}
              aria-controls={kidsId}
              aria-label={`Show the ${plural(row.count, "package", "packages")} listed under ${row.package}`}
              tabIndex={inner}
              onClick={toggle}
            >
              <Chevron />
            </button>
          )}
        </span>
      </div>
      {canOpen && (
        <ul className="rr-kids" id={kidsId} hidden={!open} aria-label={`Listed under ${row.package}`}>
          {pulledTree(row).map((node) => (
            <ChildRow
              key={node.finding.package}
              parent={row.package}
              node={node}
              env={env}
              flash={flash.includes(node.finding.package)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The key fact a Findings row quotes: its highest-level signal, else the evidence. */
function Why({ finding }: { finding: Finding }) {
  const { key } = rowSignals(finding, null);
  const text = key ? shortFact(key, finding) : finding.evidence;
  return (
    <span className="fcell fc-why rk-why" title={key?.summary ?? finding.evidence}>
      {key && (
        <span className="sid" title={SIGNAL_DEFS[key.id] ?? ""}>
          {key.id}
        </span>
      )}
      <span className="fc-why-text">
        <KeepDates text={text} />
      </span>
    </span>
  );
}

/** The chain tree's lines for one row: a rail for every ancestor with a later sibling, and the
 *  elbow into this row — drawn, never typed, and hidden from assistive tech. */
function TreeLines({ node }: { node: TreeNode }) {
  return (
    <span className="rk-tree" aria-hidden="true">
      {node.rails.map((on, lvl) =>
        on ? <i key={lvl} className="rk-rail" style={{ "--lvl": String(lvl) }} /> : null,
      )}
      <i className={node.last ? "rk-elbow is-last" : "rk-elbow"} style={{ "--lvl": String(node.depth) }} />
    </span>
  );
}

/** A package a requirement lists, in its place on the chain tree: package · verdict · why · age, the
 *  Findings row's own facts on the tab's axis. */
function ChildRow({
  parent,
  node,
  env,
  flash,
}: {
  parent: string;
  node: TreeNode;
  env: RowEnv;
  flash: boolean;
}) {
  const { model, state, dispatch, cursor } = useReport();
  const { finding } = node;
  const key = childKey(parent, finding.package);
  const first = env.first.has(key);
  const scale = env.axis ? ageScale(finding, model.report.run.thresholds, env.axis.max) : null;

  return (
    <li
      tabIndex={rowTabIndex(finding.package, cursor, first)}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      className={`rk ${toneClass(TONE(finding.verdict))}${flash ? " is-flash" : ""}`}
      style={{ "--depth": String(node.depth) }}
      {...openInteractions(finding.package, dispatch)}
    >
      <TreeLines node={node} />
      <span className="fcell rk-pkg" title={`${finding.package} ${finding.version}`}>
        <span className="rr-name">
          <PkgName name={finding.package} />
        </span>
        <span className="fc-ver">{finding.version}</span>
        {finding.dev && (
          <span className="fc-dev" title="installed only for development">
            dev
          </span>
        )}
        {node.via.length > 0 && <span className="rk-via">via {node.via.join(" → ")}</span>}
      </span>
      <span className="fcell fc-verdict rk-verdict" title={VERDICT_DEFS[finding.verdict] ?? ""}>
        {finding.verdict}
      </span>
      <Why finding={finding} />
      {scale ? (
        <AgeCell scale={scale} verdict={finding.verdict} />
      ) : (
        <AgeCellEmpty axis={env.axis} notRead={ageNotRead(finding)} />
      )}
    </li>
  );
}

/**
 * One flagged package the "only through rows above" tail reaches (PD-RADIUS-4): the package and its
 * verdict, the row it is listed under (a jump), and every tail requirement behind it. A click opens
 * the package, whose detail names every requirement it comes in through.
 */
export function ReceiptRow({ entry, env }: { entry: RadiusReceipt; env: RowEnv }) {
  const { state, dispatch, cursor } = useReport();
  const { finding, listedUnder, behind } = entry;
  const key = receiptKey(finding.package);
  const first = env.first.has(key);

  return (
    <li
      tabIndex={rowTabIndex(finding.package, cursor, first)}
      aria-current={state.pkg === finding.package ? "true" : undefined}
      aria-label={finding.package}
      data-pkg={finding.package}
      className="rrc"
      {...openInteractions(finding.package, dispatch)}
    >
      <span className="rrc-pkg">
        <span className="rr-name">
          <PkgName name={finding.package} />
        </span>
        , <VerdictWord verdict={finding.verdict} />
      </span>
      <span className="rrc-under">
        {listedUnder === null ? (
          "listed under no row"
        ) : (
          <>
            listed under{" "}
            <button
              type="button"
              className="rl-jump"
              tabIndex={innerTabIndex(finding.package, cursor, first)}
              onClick={() => {
                env.jump(listedUnder, [finding.package]);
              }}
            >
              {listedUnder}
            </button>
          </>
        )}
      </span>
      <span className="rrc-behind">
        also behind {behind.length > 2 ? `these ${String(behind.length)}: ` : ""}
        {joined(
          behind.map((name) => (
            <span key={name} className="rl-pk fl-unit">
              {name}
            </span>
          )),
        )}
      </span>
    </li>
  );
}
