import { describe, expect, test } from "vitest";

import { commandLine, isPrintableArgv, SHELLS, type Shell } from "../../../src/domain/shellArgv";
import { readContractJson } from "./recorded";

interface Row {
  argv: string[];
  posix: string;
  cmd: string;
  powershell: string;
}

const { rows } = readContractJson("en", "commands.json") as { rows: Row[] };

// The pinned golden predates SPEC §5.6's argument rule. These rows hold an argument outside the
// rule's set, so the page refuses them on every shell until lockrot's re-pin rewrites them.
const REFUSED_BY_THE_RULE = new Set([
  "composer config extra.lockrot.reason 'the team'\\''s fork'",
  "composer require 'vendor/package:~1.4,!=1.4.2'",
]);

const inEveryShell = (argv: readonly string[]): Record<Shell, string | null> =>
  Object.fromEntries(SHELLS.map((shell) => [shell, commandLine(argv, shell)])) as Record<Shell, string | null>;

const refused = { posix: null, cmd: null, powershell: null };

describe("an argv in each shell", () => {
  test.each(rows)("$posix", ({ argv, posix, cmd, powershell }) => {
    expect(inEveryShell(argv)).toEqual(REFUSED_BY_THE_RULE.has(posix) ? refused : { posix, cmd, powershell });
  });

  test("every row the rule refuses is still in the golden", () => {
    expect(rows.filter((row) => REFUSED_BY_THE_RULE.has(row.posix))).toHaveLength(REFUSED_BY_THE_RULE.size);
  });

  test("PowerShell quotes @, + and = and a comma, which POSIX leaves bare", () => {
    expect(inEveryShell(["composer", "require", "a/b:1.0,@dev", "x+y=z"])).toEqual({
      posix: "composer require a/b:1.0,@dev x+y=z",
      cmd: "composer require a/b:1.0,@dev x+y=z",
      powershell: "composer require 'a/b:1.0,@dev' 'x+y=z'",
    });
  });

  test("cmd.exe double-quotes a space, a caret, a pipe and the angle brackets", () => {
    expect(commandLine(["composer", "require", "a/b:^1.0 || <2"], "cmd")).toBe(
      'composer require "a/b:^1.0 || <2"',
    );
  });
});

describe("the command argument rule (SPEC §5.6)", () => {
  test.each([
    ["a percent variable", "%PATH%"],
    ["a delayed-expansion variable", "!PATH!"],
    ["a carriage return", "1.0\r"],
    ["a line feed", "1.0\nrm -rf"],
    ["a NUL", "1.0\u0000"],
    ["a typographic quote", "a’b"],
    ["a straight double quote", 'a"b'],
    ["a dollar sign", "$HOME"],
    ["a backtick", "`id`"],
    ["a hash", "a#b"],
    ["an ampersand", "a&b"],
    ["a semicolon", "a;b"],
    ["parentheses", "(a)"],
    ["a character outside ASCII", "ü"],
    ["the empty argument", ""],
    ["a bare --%", "--%"],
    ["an option from the data", "--working-dir=x"],
    ["a short option from the data", "-d"],
  ])("refuses %s on every shell", (_, argument) => {
    expect(isPrintableArgv(["composer", "require", argument])).toBe(false);
    expect(inEveryShell(["composer", "require", argument])).toEqual(refused);
  });

  test("allows lockrot's own --no-update option", () => {
    expect(isPrintableArgv(["composer", "require", "php:>=8.1", "--no-update"])).toBe(true);
  });

  test("allows @name and a,b, which PowerShell single-quotes", () => {
    expect(commandLine(["composer", "require", "@name", "a,b"], "powershell")).toBe(
      "composer require '@name' 'a,b'",
    );
  });

  test("refuses an empty argv", () => {
    expect(isPrintableArgv([])).toBe(false);
  });
});
