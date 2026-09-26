import { Fragment, type ComponentChildren } from "preact";
import type { Finding } from "../../model/types";
import type { RadiusElsewhere, RadiusRow, VerdictCount } from "../../domain/radius";
import { byUrgency, vendorPhrase, verdictMix } from "../../domain/radius";
import { ageNotRead, ageScale, ageZone, type AgeAxis, type Thresholds } from "../../domain/age";
import { plural } from "../../domain/format";
import { TONE, VERDICT_DEFS } from "../../domain/vocab";
import { toneClass } from "../common/common";
import { PkgMention } from "../common/PkgMention";

/**
 * The marks a Blast radius row draws (PD-RADIUS-1/2, DESIGN.md §5): a square per flagged package on
 * one square size for the whole tab, coloured by priority as the summary band's waffle is; the
 * sentence saying what the row pulls in; and the years since release of those packages on the
 * Findings tab's own axis. Every value is a count or an arrangement of the document's fields.
 */

/** Squares per tally group: a small gap every five, so 13 and 14 read apart without counting. */
export const TALLY = 5;
/** A row wider than this many squares wraps to a second line at the same square size. */
export const SQUARES_PER_LINE = 25;
/** Square plus gap, in px — `radius.css`'s `--rl-u` and `--rl-u-gap`. */
const UNIT_PX = 12;
const TALLY_GAP_PX = 3;
/** The count before the squares, and the "▢ +N" glyph after them. */
const COUNT_PX = 30;
const ELSEWHERE_PX = 44;
/** Never narrower than its column head, "Flagged underneath", in the head's condensed capitals. */
const HEAD_PX = 164;

/** The squares column's width for the whole tab: room for the longest row's squares (up to
 *  `SQUARES_PER_LINE`), so every row's squares share one scale and one left edge. */
export function squaresWidth(rows: readonly RadiusRow[]): string {
  const most = Math.min(SQUARES_PER_LINE, Math.max(5, ...rows.map((r) => r.count)));
  const tallies = Math.ceil(most / TALLY) - 1;
  const glyph = rows.some((r) => r.elsewhere.length > 0) ? ELSEWHERE_PX : 0;
  return `${String(Math.max(HEAD_PX, COUNT_PX + most * UNIT_PX + tallies * TALLY_GAP_PX + glyph))}px`;
}

/** "and"-joined parts: "a", "a and b", "a, b and c". */
export function joined(parts: readonly ComponentChildren[]): ComponentChildren {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i === 0 ? "" : i === parts.length - 1 ? " and " : ", "}
      {part}
    </Fragment>
  ));
}

/** A verdict word in its own tone, titled with its definition — the Findings row's verdict colour. */
export function VerdictWord({ verdict }: { verdict: string }) {
  return (
    <span className={`rl-vw ${toneClass(TONE(verdict))}`} title={VERDICT_DEFS[verdict] ?? ""}>
      {verdict}
    </span>
  );
}

/** "11 left-behind, 1 abandoned and 1 stale". */
export function MixWords({ mix }: { mix: readonly VerdictCount[] }) {
  return (
    <>
      {joined(
        mix.map(({ verdict, count }) => (
          <span key={verdict} className="fl-unit">
            <b>{count}</b> <VerdictWord verdict={verdict} />
          </span>
        )),
      )}
    </>
  );
}

/** A package name that breaks after its vendor's slash, the name itself kept whole. */
export function PkgName({ name }: { name: string }) {
  const slash = name.indexOf("/");
  if (slash < 0) return <span className="rl-name">{name}</span>;
  return (
    <>
      <span className="rl-vendor">{name.slice(0, slash + 1)}</span>
      <wbr />
      <span className="rl-name">{name.slice(slash + 1)}</span>
    </>
  );
}

/**
 * A row's squares: its count, a square per package it lists (most urgent first, in its priority's
 * tone, a gap every five), then — when it also reaches packages listed under another row — one
 * hollow ring and "+N". The hollow ones are counted, not drawn one by one: the length of a row is
 * only ever what it lists, so wallabag/rulerz-bundle's one package never draws as long as rulerz's
 * fourteen.
 */
export function Squares({ row, onToggle }: { row: RadiusRow; onToggle: (() => void) | null }) {
  const sorted = [...row.pulled].sort(byUrgency);
  const mix = verdictMix(row.pulled)
    .map(({ verdict, count }) => `${String(count)} ${verdict}`)
    .join(", ");
  const label = [
    row.count > 0
      ? `${plural(row.count, "flagged package", "flagged packages")} listed under it: ${mix}`
      : "",
    row.count === 0 ? "none listed under it" : "",
    row.elsewhere.length > 0
      ? `${plural(row.elsewhere.length, "more it reaches is", "more it reaches are")} listed under another row`
      : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <span
      className={onToggle ? "rl-sq is-toggle" : "rl-sq"}
      role="img"
      aria-label={label}
      title={`${label}. One square size on every row.`}
      data-no-open={onToggle ? "" : undefined}
      onClick={onToggle ?? undefined}
    >
      {/* A row listing nothing shows a dash, not a loud "0" where the squares go. */}
      <span className={row.count > 0 ? "rl-num" : "rl-num is-zero"} aria-hidden="true">
        {row.count > 0 ? row.count : "–"}
      </span>
      <span className="rl-units" aria-hidden="true">
        {sorted.map((f, i) => (
          <i
            key={f.package}
            className={`rl-u ${toneClass(TONE(f.priority))}${i > 0 && i % TALLY === 0 ? " is-tally" : ""}`}
          />
        ))}
        {row.elsewhere.length > 0 && (
          <span className="rl-else">
            <i className="rl-u is-else" />+{row.elsewhere.length}
          </span>
        )}
      </span>
    </span>
  );
}

function pct(value: number, max: number): string {
  return `${String(Math.min(100, Math.max(0, (value / max) * 100)))}%`;
}

interface Tick {
  readonly years: number;
  readonly tone: "context" | ReturnType<typeof ageZone>;
}

/**
 * The years since release of the packages a row lists, on the tab's one axis (the Findings axis,
 * `max(10, 2 × high)`): a whisker from the youngest to the oldest with end caps, and a tick at each
 * distinct age (to a tenth of a year) in its zone's tone — grey for an `abandoned` or `pinned`
 * package, whose age is context, not its reason (PD-ROWS-3). A single package is a tick alone.
 */
export function AgeSpread({
  findings,
  axis,
  thresholds,
  own = false,
}: {
  findings: readonly Finding[];
  axis: AgeAxis | null;
  thresholds: Thresholds;
  /** The ages are the row's own requirement's, not those of packages listed under it. */
  own?: boolean;
}) {
  const scales = axis ? findings.map((f) => ageScale(f, thresholds, axis.max)).filter((s) => s !== null) : [];
  if (axis === null || scales.length === 0) {
    // The Findings age cell's own words (`AgeCellEmpty`), so a package reads the same on a row here
    // and under one — "age not read" when an S10 blocked every one's age check, else "not flagged
    // for age" — said by the cell's name and title. On screen the cell is a dash in the number's
    // place, as a ledger marks a missing value, and the key under the answer says what it means:
    // the phrase itself, drawn across the track, sat on the warn and high guides.
    const notRead = findings.length > 0 && findings.every(ageNotRead);
    const words = notRead ? "age not read" : "not flagged for age";
    const title = notRead
      ? "age not read: lockrot could not read the age of these packages (see their S10 signal)"
      : "not flagged for age: none of S2 (no stable release), S4 (no push) or S8 (the installed branch stopped) fired";
    const some = findings.length > 0;
    return (
      <span
        className="fcell fc-age rl-age is-empty"
        role={some ? "img" : undefined}
        aria-label={some ? words : undefined}
        title={some ? title : undefined}
      >
        <span className="age-track" aria-hidden="true">
          {axis && (
            <>
              <span className="age-guide is-warn" style={{ left: pct(axis.warn, axis.max) }} />
              <span className="age-guide is-high" style={{ left: pct(axis.high, axis.max) }} />
            </>
          )}
        </span>
        {some && (
          <span className="age-num rl-age-dash" aria-hidden="true">
            –
          </span>
        )}
      </span>
    );
  }

  const byTenth = new Map<string, Tick>();
  for (const s of scales) {
    const key = s.years.toFixed(1);
    const tone = s.contextOnly ? "context" : ageZone(s.years, s.warn, s.high);
    const had = byTenth.get(key);
    // A tenth shared by a context-only age and a zoned one draws in the zone's tone.
    if (had === undefined || had.tone === "context") byTenth.set(key, { years: s.years, tone });
  }
  const years = scales.map((s) => s.years);
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const text = lo.toFixed(1) === hi.toFixed(1) ? lo.toFixed(1) : `${lo.toFixed(1)}–${hi.toFixed(1)}`;
  const missing = findings.length - scales.length;
  const label = [
    own ? "its own " : "",
    scales.length > 1 ? `${String(scales.length)} packages, ` : "",
    `years since release ${lo.toFixed(1) === hi.toFixed(1) ? lo.toFixed(1) : `${lo.toFixed(1)} to ${hi.toFixed(1)}`}`,
    `; warn at ${String(axis.warn)} years, high at ${String(axis.high)}`,
    scales.some((s) => s.contextOnly) ? "; grey: abandoned or pinned, age shown for context" : "",
    missing > 0 ? `; ${plural(missing, "package has", "packages have")} no age signal` : "",
  ].join("");

  return (
    <span className="fcell fc-age rl-age" role="img" aria-label={label} title={label}>
      <span className="age-track" aria-hidden="true">
        <span className="age-guide is-warn" style={{ left: pct(axis.warn, axis.max) }} />
        <span className="age-guide is-high" style={{ left: pct(axis.high, axis.max) }} />
        {hi > lo && (
          <span
            className="rl-whisker"
            style={{ left: pct(lo, axis.max), width: `calc(${pct(hi, axis.max)} - ${pct(lo, axis.max)})` }}
          />
        )}
        {[...byTenth.values()].map((tick) => (
          <span
            key={tick.years.toFixed(1)}
            className={`rl-tick ${tick.tone === "context" ? "is-context" : toneClass(tick.tone)}${
              tick.years > axis.max ? " is-over" : ""
            }`}
            style={{ left: pct(tick.years, axis.max) }}
          />
        ))}
      </span>
      <span className="age-num" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/**
 * What a row pulls in, as one sentence: one package by name and verdict; several by the verdict mix
 * and, when few words can say it truly, where they come from ("— all hoa/*", "— 8 sebastian/*,
 * 4 phpunit/* and phar-io/version").
 */
export function PullsSentence({ row }: { row: RadiusRow }) {
  const only = row.pulled.length === 1 ? row.pulled[0] : undefined;
  if (only) {
    return (
      <>
        <PkgMention name={only.package} className="rl-pk" />, <VerdictWord verdict={only.verdict} />
      </>
    );
  }
  const vendors = vendorPhrase(row.pulled);
  return (
    <>
      <MixWords mix={verdictMix(row.pulled)} />
      {vendors && (
        <>
          {" — "}
          {vendors.all ? "all " : ""}
          {joined([
            ...vendors.parts.map((part) => (
              <span key={part.text} className="rl-pk fl-unit">
                {part.count > 1 && !vendors.all ? `${String(part.count)} ` : ""}
                {part.text}
              </span>
            )),
            ...(vendors.others > 0 ? [`${String(vendors.others)} from other vendors`] : []),
          ])}
        </>
      )}
    </>
  );
}

/** The rows a row's "elsewhere" packages are listed under, each with the packages it holds. */
export function groupByListing(elsewhere: readonly RadiusElsewhere[]): readonly {
  readonly under: string | null;
  readonly packages: readonly string[];
}[] {
  const groups = new Map<string | null, string[]>();
  for (const e of elsewhere)
    groups.set(e.listedUnder, [...(groups.get(e.listedUnder) ?? []), e.finding.package]);
  return [...groups.entries()].map(([under, packages]) => ({ under, packages }));
}

/** A date inside a sentence never splits at its hyphens (a phone's narrow "why" cell did). */
export function KeepDates({ text }: { text: string }) {
  const parts = text.split(/(\d{4}-\d{2}-\d{2})/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
