import { Fragment } from "preact";
import { useId, useState } from "preact/hooks";
import type { Finding, RepositoryMetadata, Run } from "../../model/report";
import { advisoryBand } from "../../domain/advisories";
import { gradeTone, verdictTone } from "../../domain/findingRow";
import {
  advisoriesName,
  type AdvisoryAffects,
  type AdvisoryItem,
  SECURITY_WORDS,
  securityBlock,
  type SecurityRung,
  showGroupName,
  waysOut,
} from "../../domain/securityBlock";
import { toneClass } from "../common/common";
import { DisclosureButton } from "../common/Disclosure";
import { usePrinted } from "../print/printContext";
import { jumpTo, RichText } from "./RichText";

const severityTag = (run: Run, severity: string) => (
  <span className={`tag ${toneClass(gradeTone(advisoryBand(run, severity)))}`}>{severity}</span>
);

/** A break chance after each "|" that ends an alternative, and nowhere else. */
const withBreaks = (parts: readonly string[]) =>
  parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));

/** `advisory` ends the folded range button's name: the row's own id, since two rows can share a CVE. */
function Affects({ affects, advisory }: { affects: AdvisoryAffects; advisory: string }) {
  const [opened, setOpen] = useState(false);
  const printed = usePrinted();
  const open = opened || printed;
  const id = `${useId()}-range`;
  if (affects.folded === null) {
    return (
      <span className="d3-adv-affects">
        {SECURITY_WORDS.affects}
        <code className="d3-adv-range">{withBreaks(affects.parts)}</code>
      </span>
    );
  }
  return (
    <>
      <span className="d3-adv-affects is-folded">
        {SECURITY_WORDS.affects}
        <DisclosureButton
          className="d3-range-btn"
          label={affects.folded}
          name={`${affects.folded} for ${advisory}`}
          open={open}
          controls={id}
          onToggle={() => {
            setOpen(!open);
          }}
        />
      </span>
      <code className="d3-adv-range is-lines" id={id} hidden={!open}>
        {affects.parts.map((part, i) => (
          <span key={i} className="d3-range-alt">
            {part}
          </span>
        ))}
      </code>
    </>
  );
}

interface RowProps {
  row: AdvisoryItem;
  rowId: (at: number) => string;
  at: number;
  run: Run;
  withTag: boolean;
  reveal: (at: number) => void;
}

function AdvisoryRow({ row, rowId, at, run, withTag, reveal }: RowProps) {
  const { sameAs } = row;
  return (
    <li className="d3-adv" id={rowId(at)}>
      <div className="d3-adv-head">
        {withTag && <>{severityTag(run, row.severity)} </>}
        {row.href === null ? (
          <span className="d3-adv-id">{row.name}</span>
        ) : (
          <a
            className="lnk d3-adv-id"
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={row.linkName}
          >
            {row.name}
          </a>
        )}
        {row.source !== null && (
          <>
            {" "}
            <span className="d3-adv-src">{row.source}</span>
          </>
        )}
        {row.deciding && (
          <>
            {" "}
            <span className="d3-rung-mark">{SECURITY_WORDS.deciding}</span>
          </>
        )}
      </div>
      <div className="d3-adv-meta">
        <span className="d3-adv-fix">{row.fix}</span>
        {row.affects !== null && (
          <>
            <span className="d3-adv-sep">{SECURITY_WORDS.separator}</span>
            <Affects affects={row.affects} advisory={row.source ?? row.name} />
          </>
        )}
        {sameAs !== null && (
          <span className="d3-adv-same">
            {SECURITY_WORDS.sameAs}
            <a
              className="lnk"
              href={`#${rowId(sameAs.at)}`}
              onClick={(event) => {
                reveal(sameAs.at);
                jumpTo(event, rowId(sameAs.at));
              }}
            >
              {sameAs.id}
            </a>
          </span>
        )}
      </div>
    </li>
  );
}

function Rung({ rung, run }: { rung: SecurityRung; run: Run }) {
  return (
    <li className={rung.move ? "d2-rung is-move" : "d2-rung"} data-branch={rung.branch}>
      <div className="d3-rung-head">
        <span className="d2-rung-branch">{rung.branch}</span>
        {rung.marks.map((mark) => (
          <Fragment key={mark}>
            {" "}
            <span className={mark === "the move" ? "d3-rung-mark is-move" : "d3-rung-mark"}>{mark}</span>
          </Fragment>
        ))}{" "}
        {rung.clears}
      </div>
      <div className="d3-rung-line">{rung.kind}</div>
      {rung.after !== null && (
        <div className="d3-rung-line">
          <span className={`d2-after ${toneClass(verdictTone(run.score_model, rung.afterVerdict ?? ""))}`}>
            {rung.after}
          </span>
        </div>
      )}
    </li>
  );
}

/** The Security row (SPEC §7.9.8.10): the summary, the advisory list by severity, the ignored
 *  advisories and the ladder. `id` is the row's, which the verdict's count jumps to. */
export function SecurityRow2({
  finding,
  run,
  metadata,
  id,
}: {
  finding: Finding;
  run: Run;
  metadata: RepositoryMetadata | null;
  id: string;
}) {
  const block = securityBlock(finding, run, metadata);
  const [openGroups, setOpenGroups] = useState<readonly number[]>(() =>
    block.groups.flatMap((group, i) => (group.open ? [i] : [])),
  );
  const rowId = (at: number): string => `${id}-adv-${at}`;
  const groupId = (i: number): string => `${id}-sev-${i}`;
  const openGroup = (i: number): void => {
    setOpenGroups((open) => (open.includes(i) ? open : [...open, i]));
  };
  const toggleGroup = (i: number): void => {
    setOpenGroups((open) => (open.includes(i) ? open.filter((g) => g !== i) : [...open, i]));
  };
  const groupOf = (at: number): number => block.groups.findIndex((group) => group.rows.includes(at));
  const reveal = (at: number): void => {
    const group = groupOf(at);
    if (group >= 0) openGroup(group);
  };
  const grouped = block.groups.length > 0;
  const row = (at: number) => {
    const item = block.rows[at];
    return (
      item !== undefined && (
        <AdvisoryRow key={at} row={item} rowId={rowId} at={at} run={run} withTag={!grouped} reveal={reveal} />
      )
    );
  };

  return (
    <>
      <ul className="d3-lines">
        <li>
          {block.head}
          {block.counts.length > 0 && (
            <ul className="d3-sev-counts">
              {block.counts.map(({ severity, count }) => {
                const group = block.groups.findIndex((g) => g.severity === severity);
                const body = (
                  <>
                    {severityTag(run, severity)} <b>{count}</b>
                  </>
                );
                return (
                  <li key={severity}>
                    {group < 0 ? (
                      body
                    ) : (
                      <a
                        className="lnk d3-sev-jump"
                        href={`#${groupId(group)}`}
                        aria-label={showGroupName(count, severity)}
                        onClick={(event) => {
                          openGroup(group);
                          jumpTo(event, groupId(group));
                        }}
                      >
                        {body}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
        {block.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {block.meanwhile !== null && (
          <li className="d3-meanwhile">
            <RichText rich={block.meanwhile} />
          </li>
        )}
      </ul>
      {block.rows.length > 0 && (
        <div className={grouped ? "d3-advs is-grouped" : "d3-advs"}>
          <p className="d3-adv-cap">
            {block.caption[0]}
            {block.caption[1] !== undefined && <span className="d3-q-line">{block.caption[1]}</span>}
          </p>
          {grouped ? (
            block.groups.map((group, i) => {
              const open = openGroups.includes(i);
              const listId = `${groupId(i)}-rows`;
              return (
                <div key={group.severity} className="d3-sev-group">
                  <h4 className="d3-sev-head" id={groupId(i)}>
                    <button
                      type="button"
                      className="d3-sev-btn"
                      aria-expanded={open}
                      aria-controls={listId}
                      onClick={() => {
                        toggleGroup(i);
                      }}
                    >
                      {severityTag(run, group.severity)}
                      <b className="d3-sev-n">{group.count}</b>
                      <span className="d3-sev-word">{group.words}</span>
                      <span className="l1-mark" aria-hidden="true" />
                    </button>
                  </h4>
                  <ul className="d3-adv-list" id={listId} hidden={!open}>
                    {group.rows.map(row)}
                  </ul>
                </div>
              );
            })
          ) : (
            <ul className="d3-adv-list" aria-label={advisoriesName(block.rows.length)}>
              {block.rows.map((_, at) => row(at))}
            </ul>
          )}
        </div>
      )}
      {block.ignored.length > 0 && (
        <ul className="d2-ignored">
          {block.ignored.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {block.ladder.length > 0 && (
        <ol className="d2-ladder" aria-label={waysOut(block.ladder.length)}>
          {block.ladder.map((rung) => (
            <Rung key={rung.branch} rung={rung} run={run} />
          ))}
        </ol>
      )}
    </>
  );
}
