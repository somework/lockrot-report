// Where the model's block golden at the pinned commit is wrong, the page's tests expect the rule value.
// Each correction names the rule that wins; remove it when the model's golden holds the rule.

import type { Finding, Run } from "../../../src/model/report";

export interface GoldenCard {
  commands: string[];
  commands_label: string | null;
  after: { result: string | null; conditions: string[] } | null;
}

// SPEC §7.9.8.6 and G114: several steps read "Commands, in order". The model writes "Command".
export const SINGULAR_LABEL_CASES = [
  "A",
  "A-baselined-dagger",
  "A-gate-critical",
  "A-gate-vulnerable",
  "F",
  "feeds-drupal-dagger",
  "guzzle",
  "guzzle-mixed",
  "holder-vuln-dagger",
  "joomla-filter",
  "long-range-dagger",
  "pagerfanta",
  "partial",
  "partial-op-dagger",
  "policy-off-dagger",
  "twig-1",
  "twig-dev-dagger",
  "yaml-3.4",
];

// lockrot's `CommandArgument::allPass` admits `--with-dependencies` after the package, and its golden
// `commands_posix` prints the line. The model's argument rule refuses the option.
const OPTION_REFUSED_CASES: Readonly<Record<string, string[]>> = {
  "move-check-dagger": ["composer update 'typo3/html-sanitizer:^2.3.2' --with-dependencies"],
};

export const singularSeveral = (card: GoldenCard): boolean =>
  card.commands.length > 1 && card.commands_label === "Command";

// SPEC §7.9.21 "The move" (coordinator ruling): the check line is one After condition in the place
// of "if Composer resolves it". The model writes the bare caveat, and no line for a checked move.
const COMPOSER_KINDS = ["update", "require", "raise-php", "tag"];
const CAVEAT = "if Composer resolves it";

const REASON_WORDS: Readonly<Record<string, string>> = {
  offline: "a package it needs is not in Composer's cache",
  unloaded_name: "a package it needs could not be loaded",
  baseline_refused: "Composer refuses the lock itself",
};

type Step = NonNullable<Finding["next_step"]>;

function specCheckLine(move: Pick<Step, "kind" | "check">, run: Run): string | null {
  if (move.check === null)
    return run.move_check === null && COMPOSER_KINDS.includes(move.kind)
      ? `${CAVEAT} (not checked: the run checked no move)`
      : null;
  if (move.check.result === "resolves") return "checked with Composer";
  if (move.check.result === "refused") return "Composer refuses the move";
  return `${CAVEAT} (not checked: ${REASON_WORDS[move.check.reason ?? ""] ?? move.check.reason ?? ""})`;
}

const NEW_VERSIONS = "advisories on its new versions not checked";

function withCheckLine(card: GoldenCard, line: string | null): GoldenCard {
  if (line === null) return card;
  if (card.after === null) return { ...card, after: { result: null, conditions: [line] } };
  const kept = card.after.conditions.filter((condition) => condition !== CAVEAT);
  const at = kept.includes(NEW_VERSIONS) ? kept.indexOf(NEW_VERSIONS) : kept.length;
  return { ...card, after: { ...card.after, conditions: [...kept.slice(0, at), line, ...kept.slice(at)] } };
}

export function corrected(name: string, key: string, golden: unknown, finding: Finding, run: Run): unknown {
  if (key !== "moves") return golden;
  const commands = OPTION_REFUSED_CASES[name];
  const moves = finding.next_step === null ? [] : [finding.next_step, ...finding.next_step.also];
  const graded = "decided_by" in finding.score;
  return (golden as GoldenCard[]).map((card, index) => {
    const move = moves[index];
    const fixed = {
      ...card,
      ...(index === 0 && commands !== undefined ? { commands } : {}),
      ...(SINGULAR_LABEL_CASES.includes(name) && singularSeveral(card)
        ? { commands_label: "Commands, in order" }
        : {}),
    };
    return move === undefined || !graded ? fixed : withCheckLine(fixed, specCheckLine(move, run));
  });
}
