/**
 * A command line, as lockrot's `commands[]` publish it (one argv per command), written for a shell.
 * The page never builds a command from a constraint: it quotes the argv it is given, and only an
 * argv that passes SPEC §5.6's argument rule, because a report file can be edited.
 */

export const SHELLS = ["posix", "cmd", "powershell"] as const;
export type Shell = (typeof SHELLS)[number];

export const SHELL_NAMES: Readonly<Record<Shell, string>> = {
  posix: "POSIX",
  cmd: "cmd.exe",
  powershell: "PowerShell",
};

/** What the page prints in place of a command it refuses. */
export const REFUSED_COMMAND = "This command holds characters the page does not print.";

// `CommandArgument`: inside cmd.exe's double quotes `%` and `!` still expand, PowerShell closes a
// single-quoted string at U+2018 to U+201B, and a CR or LF splits a pasted line.
const COMMAND_ARGUMENT = /^(?! +$)[A-Za-z0-9/._:@+=,^~*<>| -]+$/;
// Any other program or subcommand runs what the data names (`composer exec calc`, `iex calc`).
const SUBCOMMANDS: ReadonlySet<string> = new Set(["update", "require", "why-not"]);
// Anywhere else, a leading `-` came from data and would pass an option to Composer.
const LOCKROT_OPTIONS: Readonly<Record<string, string>> = { require: "--no-update" };

const POSIX_BARE = /^[A-Za-z0-9/._:@%+=,-]+$/;
const CMD_SPECIAL = /[ ^|<>]/;

/** A package name inside a command the page writes itself: the argument set and no leading `-`,
 *  with no option allowed (SPEC §5.6). */
export const isPrintableName = (name: string): boolean =>
  COMMAND_ARGUMENT.test(name) && !name.startsWith("-");

/** lockrot's `CommandArgument::allPass`. */
export function isPrintableArgv(argv: readonly string[]): boolean {
  const [program, subcommand = ""] = argv;
  if (program !== "composer" || !SUBCOMMANDS.has(subcommand)) return false;
  return argv.every(
    (argument) =>
      COMMAND_ARGUMENT.test(argument) &&
      (!argument.startsWith("-") || LOCKROT_OPTIONS[subcommand] === argument),
  );
}

// The rule leaves no quote, `%` or `!` inside an argument, so no quoting below escapes one.
export const posixArgument = (argument: string): string =>
  POSIX_BARE.test(argument) && !argument.startsWith("=") ? argument : `'${argument}'`;
const cmdWords = (words: readonly string[]): string[] =>
  words.map((word) => (CMD_SPECIAL.test(word) ? `"${word}"` : word));

// `composer` is often composer.bat, and PowerShell hands a .bat target's arguments to cmd.exe,
// which parses `|`, `<`, `>` and `^` again. After `--%` PowerShell passes the rest verbatim.
const WORDS: Readonly<Record<Shell, (argv: readonly string[]) => string[]>> = {
  posix: (argv) => argv.map(posixArgument),
  cmd: cmdWords,
  powershell: ([program = "", ...rest]) => [program, "--%", ...cmdWords(rest)],
};

/** The words of a command line, each quoted for the shell, so a line breaks only between them.
 *  `null` when the argv fails the argument rule: no shell gets a line then. */
export function commandWords(argv: readonly string[], shell: Shell): string[] | null {
  return isPrintableArgv(argv) ? WORDS[shell](argv) : null;
}

export function commandLine(argv: readonly string[], shell: Shell): string | null {
  return commandWords(argv, shell)?.join(" ") ?? null;
}
