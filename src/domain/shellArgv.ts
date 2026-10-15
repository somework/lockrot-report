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
const COMMAND_ARGUMENT = /^[A-Za-z0-9/._:@+=,^~*<>| -]+$/;
const LOCKROT_OPTIONS: ReadonlySet<string> = new Set(["--no-update"]);

const POSIX_BARE = /^[A-Za-z0-9/._:@%+=,-]+$/;
const CMD_SPECIAL = /[ ^&|<>()"]/;
const POWERSHELL_BARE = /^[A-Za-z0-9/._:-]+$/;

const isArgument = (argument: string): boolean =>
  COMMAND_ARGUMENT.test(argument) && (!argument.startsWith("-") || LOCKROT_OPTIONS.has(argument));

export function isPrintableArgv(argv: readonly string[]): boolean {
  return argv.length > 0 && argv.every(isArgument);
}

// The rule leaves no quote, `%` or `!` inside an argument, so no quoting below escapes one.
const posixWord = (argument: string): string =>
  POSIX_BARE.test(argument) && !argument.startsWith("=") ? argument : `'${argument}'`;
const cmdWord = (argument: string): string => (CMD_SPECIAL.test(argument) ? `"${argument}"` : argument);

// `composer` is often composer.bat, and PowerShell hands a .bat target's arguments to cmd.exe,
// which re-parses single quotes. After `--%` PowerShell passes the rest verbatim.
function powershellLine(argv: readonly string[]): string {
  if (argv.every((argument) => POWERSHELL_BARE.test(argument))) return argv.join(" ");
  const [target, ...rest] = argv;
  return [target, "--%", ...rest.map(cmdWord)].join(" ");
}

const LINE: Readonly<Record<Shell, (argv: readonly string[]) => string>> = {
  posix: (argv) => argv.map(posixWord).join(" "),
  cmd: (argv) => argv.map(cmdWord).join(" "),
  powershell: powershellLine,
};

/** `null` when the argv fails the argument rule: no shell gets a line then. */
export function commandLine(argv: readonly string[], shell: Shell): string | null {
  return isPrintableArgv(argv) ? LINE[shell](argv) : null;
}
