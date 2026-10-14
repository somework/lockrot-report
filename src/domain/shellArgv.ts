/**
 * A command line, as lockrot's `commands[]` publish it (one argv per command), written for a shell.
 * The page never builds a command from a constraint: it quotes the argv it is given.
 */

const POSIX_BARE = /^[A-Za-z0-9/._:@%+=,-]+$/;
const CMD_SPECIAL = /[\s^&|<>()%!"]/;

function posixWord(argument: string): string {
  return POSIX_BARE.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;
}

function cmdWord(argument: string): string {
  return argument === "" || CMD_SPECIAL.test(argument) ? `"${argument.replaceAll('"', '""')}"` : argument;
}

function powershellWord(argument: string): string {
  return POSIX_BARE.test(argument) ? argument : `'${argument.replaceAll("'", "''")}'`;
}

export function argvPosix(argv: readonly string[]): string {
  return argv.map(posixWord).join(" ");
}

export function argvCmd(argv: readonly string[]): string {
  return argv.map(cmdWord).join(" ");
}

export function argvPowershell(argv: readonly string[]): string {
  return argv.map(powershellWord).join(" ");
}
