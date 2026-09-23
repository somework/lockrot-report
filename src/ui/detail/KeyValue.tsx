import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import "./detail.css";

/**
 * One row of a definition list: a label and whatever is shown for it. `value` is `null` for "this
 * package has nothing to say here" — the sentinel `presentRows` filters on — never for "the value
 * is the empty string", which a caller never produces.
 */
export interface KeyValueRow {
  readonly label: string;
  readonly value: ComponentChildren;
}

/**
 * A `<dl>` of label/value pairs — the shape "The lock entry", "Provenance" and a signal's data dump
 * all share. Ported from legacy's `kv` list markup (`report.js:761-776`, `lib.js:80-82`) as a
 * component instead of a joined HTML string. Renders nothing for an empty row set, so a caller that
 * always wants a heading even with nothing under it (critic.md C6) renders the `<section>` itself
 * and puts this inside it.
 */
export function KeyValue({ rows }: { rows: readonly KeyValueRow[] }) {
  if (rows.length === 0) return null;

  return (
    <dl className="detail-kv">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * Drops a row whose value is `null`, `undefined` or the empty string — ported from legacy `kvRows`
 * (`lib.js:189-192`), which dropped all three. `asNullableString` (`model/normalize.ts`) passes an
 * empty string from the wire document through unchanged, so a typed caller does produce `""` for
 * "nothing to show", not only `null` — this used to keep such a row with a blank `dd` instead of
 * dropping it, unlike legacy (parity finding). Used by the sections whose rows are each individually
 * optional (the lock entry, provenance); a signal's data dump does not filter at all — every key it
 * has is shown, `null` included, spelled out as the text `"null"`.
 */
export function presentRows(rows: readonly KeyValueRow[]): readonly KeyValueRow[] {
  return rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
}
