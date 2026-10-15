/**
 * The "How the score works" panel as lines of text (SPEC §7.9.12). The page keeps words keyed by
 * ids (`RULE_WORDS`); every weight, band, share and example is read from `run.score_model` and
 * `run.score_rules_used`.
 */

import type { Run, ScoreRule } from "../model/report";
import {
  PANEL_WORDS,
  RULE_KIND_WORDS,
  RULE_NOT_FOR_SECURITY_DEV,
  RULE_WORDS,
  SEVERITY_BASIS_WORDS,
  SORT_WORDS,
  fixLabel,
  ruleWhyWord,
  shareGlyph,
  wordFor,
  zeroVerdictReason,
} from "./pageVocabulary";

type Model = Run["score_model"];
type Slots = Readonly<Record<string, string | undefined>>;

const DOT = " · ";

/** `null` when the template names a slot without a value: such a part is left out, never printed with the slot. */
function fill(template: string, slots: Slots): string | null {
  const unfilled: string[] = [];
  const text = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = slots[name];
    if (value === undefined) unfilled.push(name);
    return value ?? "";
  });
  return unfilled.length === 0 ? text : null;
}

const asText = (value: number | string | undefined): string | undefined =>
  value === undefined ? undefined : String(value);

const ascendingBands = (model: Model) => [...model.bands].sort((a, b) => a.floor - b.floor);

function floorsWord(model: Model, from: string | undefined): string {
  const bands = ascendingBands(model);
  const start = bands.findIndex(({ verdict }) => verdict === from);
  const up = (start === -1 ? bands : bands.slice(start)).map(({ floor }) => String(floor)).join(DOT);
  const below = (start === -1 ? [] : bands.slice(0, start))
    .map(({ verdict, floor }) => fill(PANEL_WORDS.floorsBelow, { verdict, floor: String(floor) }) ?? verdict)
    .join(DOT);
  return [up, below].filter((part) => part !== "").join("; ");
}

function zeroWord(model: Model): string {
  return model.zero_verdicts
    .map(({ verdict, when }) => {
      const reason = zeroVerdictReason(when);
      return reason === null ? verdict : `${verdict} (${reason})`;
    })
    .join(DOT);
}

/** Rule 4's caption: how each severity's points are read, the band-floor ones named together. */
function advisoryBasis(model: Model): string {
  const onFloor = model.severities.filter(({ basis }) => basis.points === "band_floor").map(({ id }) => id);
  const clauses =
    onFloor.length === 0 ? [] : [fill(SEVERITY_BASIS_WORDS["band_floor"] ?? "", { ids: onFloor.join(", ") })];
  for (const { id, counts_as: countsAs, basis } of model.severities) {
    if (basis.points === "band_floor") continue;
    const template = Object.hasOwn(SEVERITY_BASIS_WORDS, basis.points)
      ? SEVERITY_BASIS_WORDS[basis.points]
      : undefined;
    const slots = {
      id,
      counts_as: countsAs ?? undefined,
      of: basis.of,
      share: basis.share && shareGlyph(basis.share),
    };
    clauses.push((template && fill(template, slots)) ?? `${id} (${basis.points})`);
  }
  return clauses.filter((clause) => clause !== null).join("; ");
}

function ruleSlots(rule: ScoreRule, model: Model): Slots {
  const illustration = Object.entries(rule.illustration ?? {}).map(
    ([key, value]) => [key, String(value)] as const,
  );
  return {
    ...Object.fromEntries(illustration),
    share: rule.share && shareGlyph(rule.share),
    factor: asText(rule.factor),
    by: asText(rule.by),
    ratio: asText(rule.ratio),
    ratio_from: rule.ratio_from,
    cap_multiplier: asText(rule.cap_multiplier),
    op: rule.op,
    covers: rule.covers?.replaceAll("_", " "),
    accept_group: rule.accept_group,
    when: rule.when?.join(" or "),
    order: rule.order?.replaceAll("_", " "),
    tie_break: rule.tie_break?.map(({ key }) => key).join(", "),
    floors: floorsWord(model, rule.ratio_from),
    zero: zeroWord(model),
    sort: model.sort.map(({ key }) => wordFor(SORT_WORDS.key, key)).join(PANEL_WORDS.sortJoin),
    basis: advisoryBasis(model),
  };
}

/** "used on N", muted at 0; "—" for a rule the engine does not count; "" for an id the report omits. */
function usedOn(used: Run["score_rules_used"], id: string): { used: string; muted: boolean } {
  if (!Object.hasOwn(used, id)) return { used: "", muted: false };
  const count = used[id];
  if (count === null || count === undefined) return { used: PANEL_WORDS.none, muted: false };
  return { used: `used on ${count}`, muted: count === 0 };
}

/** The text after the label: a known id from its words, an unknown id from the arithmetic of its `kind`. */
function ruleText(rule: ScoreRule, model: Model, run: Run): { label: string; text: string; known: boolean } {
  const slots = ruleSlots(rule, model);
  const words = Object.hasOwn(RULE_WORDS, rule.id) ? RULE_WORDS[rule.id] : undefined;
  if (words === undefined) {
    const kind = Object.hasOwn(RULE_KIND_WORDS, rule.kind) ? RULE_KIND_WORDS[rule.kind] : undefined;
    return { label: rule.id, text: (kind && fill(kind, slots)) ?? "", known: false };
  }
  const devTail =
    rule.kind === "exempt" && run.include_dev && model.rules.some(({ id }) => id === "divide-dev")
      ? `; ${RULE_NOT_FOR_SECURITY_DEV}`
      : "";
  const example = words.example === undefined ? null : fill(words.example, slots);
  const parts = [
    fill(words.caption, slots) ?? ruleWhyWord(rule.why),
    example === null ? null : `${example}${devTail}`,
  ];
  return {
    label: fill(words.label, slots) ?? rule.id,
    text: parts.filter((part) => part !== null && part !== "").join(": "),
    known: true,
  };
}

export interface RuleRow {
  id: string;
  stage: number;
  /** False for an id the page has no words for: its label is the id, set as code. */
  known: boolean;
  label: string;
  text: string;
  used: string;
  muted: boolean;
  href: string;
}

function ruleRow(rule: ScoreRule, model: Model, run: Run): RuleRow {
  return {
    id: rule.id,
    stage: rule.stage,
    ...ruleText(rule, model, run),
    ...usedOn(run.score_rules_used, rule.id),
    href: `${model.docs}#${rule.doc}`,
  };
}

function ruleLine({ stage, label, text, used, muted }: RuleRow): string {
  const count = used === "" ? "" : `${DOT}${used}${muted ? " (muted)" : ""}`;
  return `${String(stage).padStart(2)} ${label}${text === "" ? "" : `: ${text}`}${count}`;
}

function bandsLine(model: Model): string {
  const ruler = ascendingBands(model)
    .map(({ verdict, floor }) => `${verdict} ${floor}`)
    .join(DOT);
  const rule = model.rules.find(({ id }) => id === "band-floors");
  const caption = rule && fill(PANEL_WORDS.bandsCaption, ruleSlots(rule, model));
  return [fill(PANEL_WORDS.bands, { ruler }), caption].filter((part) => part).join("; ");
}

function weightsLine(model: Model): string {
  const weighted = model.flags.filter(({ points }) => points !== null);
  const weights = weighted.map(
    ({ id, points, band }) => `${id} ${points}${band === null ? "" : ` (${band})`}`,
  );
  const share = model.rules.find(({ id }) => id === "corroborating-share")?.share;
  const afterLead =
    share &&
    fill(PANEL_WORDS.afterLead, {
      share: shareGlyph(share),
      shares: weighted
        .map(({ can_corroborate: can, corroborating_points: points }) =>
          can && points !== null ? String(points) : PANEL_WORDS.none,
        )
        .join(DOT),
    });
  return [fill(PANEL_WORDS.weights, { weights: weights.join(DOT) }), afterLead]
    .filter((part) => part)
    .join("; ");
}

function anchorLine(model: Model): string | null {
  const bands = model.flags.filter(({ points }) => points !== null);
  const anchor = bands.some(({ basis }) => basis.v013_base !== null)
    ? fill(PANEL_WORDS.anchor, {
        bands: bands.map(({ basis }) => basis.v013_base ?? PANEL_WORDS.none).join(DOT),
      })
    : null;
  const limits = bands
    .filter(({ max_maintenance: max }) => max !== null)
    .map(
      ({ max_maintenance: max, max_maintenance_flags: flags }) =>
        `${max}${flags === null ? "" : ` (${flags.join(" + ")})`}`,
    );
  const corroboration =
    limits.length === 0 ? null : fill(PANEL_WORDS.corroboration, { limits: limits.join(DOT) });
  const parts = [anchor, corroboration].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join("; ");
}

function advisoriesLine(model: Model): string {
  const points = model.severities.map(({ id, points: weight, counts_as: countsAs }) =>
    countsAs === null
      ? `${id} ${weight}`
      : (fill(PANEL_WORDS.counts_as, { id, points: String(weight), counts_as: countsAs }) ?? id),
  );
  const factor = model.rules.find(({ id }) => id === "no-reachable-fix-multiplier")?.factor;
  const badge = factor === undefined ? "" : `${fill(PANEL_WORDS.factor, { factor: String(factor) })} `;
  const noFix = fill(PANEL_WORDS.noReachableFix, {
    points: model.severities.map(({ points_no_reachable_fix: weight }) => weight).join(DOT),
  });
  return `${fill(PANEL_WORDS.advisories, { points: points.join(DOT) })}; ${badge}${noFix}`;
}

function fixesLine(model: Model): string {
  const factor = model.rules.find(({ id }) => id === "no-reachable-fix-multiplier")?.factor;
  const badge =
    (factor === undefined ? null : fill(PANEL_WORDS.factor, { factor: String(factor) })) ??
    PANEL_WORDS.doubled;
  const fixes = [...model.fix_kinds]
    .sort((a, b) => a.ease - b.ease)
    .map(({ id, doubles }) => `${fixLabel(id)}${doubles ? ` ${badge}` : ""}`);
  return fill(PANEL_WORDS.fixes, { fixes: fixes.join(DOT) }) ?? "";
}

export interface ScorePanelParts {
  title: string;
  bands: string;
  zero: string;
  weights: string;
  anchor: string | null;
  advisories: string;
  rules: RuleRow[];
  fixes: string;
}

/** The panel's parts for one report. The live example (the clicked finding's score) is the caller's. */
export function scorePanelParts(run: Run): ScorePanelParts {
  const model = run.score_model;
  return {
    title: fill(PANEL_WORDS.title, { id: String(model.id) }) ?? "",
    bands: bandsLine(model),
    zero: fill(PANEL_WORDS.zero, { zero: zeroWord(model) }) ?? "",
    weights: weightsLine(model),
    anchor: anchorLine(model),
    advisories: advisoriesLine(model),
    rules: [...model.rules].sort((a, b) => a.stage - b.stage).map((rule) => ruleRow(rule, model, run)),
    fixes: fixesLine(model),
  };
}

/** The panel's lines, as `r3/page-goldens.json` holds them. */
export function scorePanel(run: Run): string[] {
  const parts = scorePanelParts(run);
  return [
    parts.title,
    parts.bands,
    parts.zero,
    parts.weights,
    ...(parts.anchor === null ? [] : [parts.anchor]),
    parts.advisories,
    ...parts.rules.map(ruleLine),
    parts.fixes,
  ];
}

export interface BandRuler {
  zones: { verdict: string; from: number; to: number }[];
  ticks: { at: number; text: string }[];
}

/** Each band from its floor to the next, as shares of `bar_max`; the lowest band starts at 0. */
export function bandRuler(model: Model): BandRuler {
  const bands = ascendingBands(model);
  const at = (floor: number): number => Math.min(1, floor / model.bar_max);
  const zones = bands.map(({ verdict }, index) => ({
    verdict,
    from: index === 0 ? 0 : at(bands[index]?.floor ?? 0),
    to: at(bands[index + 1]?.floor ?? model.bar_max),
  }));
  const floors = bands.slice(1).map(({ floor }) => ({ at: at(floor), text: String(floor) }));
  return { zones, ticks: [{ at: 0, text: "0" }, ...floors, { at: 1, text: String(model.bar_max) }] };
}

export interface TableCell {
  text: string;
  /** A grade the cell names, for its tone. */
  band?: string;
}

export interface ScoreTable {
  caption: string;
  head: string[];
  rows: TableCell[][];
}

const bandCell = (band: string | null): TableCell =>
  band === null ? { text: PANEL_WORDS.none } : { text: band, band };

/** The weight and advisory tables: the panel's Weights and Advisories lines, one row per id. */
export function scoreTables(model: Model): { weights: ScoreTable; advisories: ScoreTable } {
  const share = model.rules.find(({ id }) => id === "corroborating-share")?.share;
  const factor = model.rules.find(({ id }) => id === "no-reachable-fix-multiplier")?.factor;
  const weights = model.flags
    .filter(({ points }) => points !== null)
    .map((flag): TableCell[] => [
      { text: flag.id },
      { text: String(flag.points) },
      bandCell(flag.band),
      {
        text:
          flag.can_corroborate && flag.corroborating_points !== null
            ? String(flag.corroborating_points)
            : PANEL_WORDS.none,
      },
      bandCell(flag.basis.v013_base),
      {
        text:
          flag.max_maintenance === null
            ? PANEL_WORDS.none
            : `${flag.max_maintenance}${flag.max_maintenance_flags === null ? "" : ` (${flag.max_maintenance_flags.join(" + ")})`}`,
      },
    ]);
  const advisories = model.severities.map((severity): TableCell[] => [
    { text: severity.counts_as === null ? severity.id : `${severity.id} (counts as ${severity.counts_as})` },
    { text: String(severity.points) },
    bandCell(severity.band),
    { text: String(severity.points_no_reachable_fix) },
    bandCell(severity.band_no_reachable_fix),
  ]);
  return {
    weights: {
      caption: "Weights",
      head: [
        "Flag",
        "Points",
        "Band",
        share === undefined ? "After the lead" : `After the lead, ${shareGlyph(share)}`,
        "The previous release's band",
        "With corroboration, at most",
      ],
      rows: weights,
    },
    advisories: {
      caption: "Advisories",
      head: [
        "Severity",
        "Points",
        "Band",
        `${factor === undefined ? "" : `${fill(PANEL_WORDS.factor, { factor: String(factor) }) ?? ""}: `}no reachable fix`,
        "Band",
      ],
      rows: advisories,
    },
  };
}
