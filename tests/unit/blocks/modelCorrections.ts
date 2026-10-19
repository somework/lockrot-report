// Where the model's block golden at the pinned commit is wrong, the page's tests expect the rule value.
// Each correction names the rule that wins; remove it when the model's golden holds the rule.

export interface GoldenCard {
  commands: string[];
  commands_label: string | null;
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

export function corrected(name: string, key: string, golden: unknown): unknown {
  if (key !== "moves") return golden;
  const commands = OPTION_REFUSED_CASES[name];
  return (golden as GoldenCard[]).map((card, index) => ({
    ...card,
    ...(index === 0 && commands !== undefined ? { commands } : {}),
    ...(SINGULAR_LABEL_CASES.includes(name) && singularSeveral(card)
      ? { commands_label: "Commands, in order" }
      : {}),
  }));
}
