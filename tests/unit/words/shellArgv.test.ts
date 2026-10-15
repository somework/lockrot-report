import { describe, expect, test } from "vitest";

import {
  commandLine,
  isPrintableArgv,
  isPrintableName,
  posixArgument,
  SHELLS,
  type Shell,
} from "../../../src/domain/shellArgv";
import { readContractJson, recordedCases } from "./recorded";

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

// The pinned golden single-quotes for PowerShell. SPEC §5.6 now writes argv[0], `--%`, then the
// cmd.exe rendering of the rest, because PowerShell hands a .bat target to cmd.exe. Keyed by the
// row's POSIX line; the re-pin rewrites these rows.
const POWERSHELL_BY_THE_NEW_RULE: Readonly<Record<string, string>> = {
  "composer require 'friendsofsymfony/oauth-server-bundle:^1.6.2'":
    'composer --% require "friendsofsymfony/oauth-server-bundle:^1.6.2"',
  "composer require 'geoip2/geoip2:^3.4'": 'composer --% require "geoip2/geoip2:^3.4"',
  "composer require 'guzzlehttp/guzzle:^7.15.2'": 'composer --% require "guzzlehttp/guzzle:^7.15.2"',
  "composer require 'guzzlehttp/guzzle:^8.2'": 'composer --% require "guzzlehttp/guzzle:^8.2"',
  "composer require 'joomla/filter:^3.0.5'": 'composer --% require "joomla/filter:^3.0.5"',
  "composer require 'joomla/string:^3.0'": 'composer --% require "joomla/string:^3.0"',
  "composer require 'laravel/framework:^12.69.0'": 'composer --% require "laravel/framework:^12.69.0"',
  "composer require 'php:>=7.2.5' --no-update": 'composer --% require "php:>=7.2.5" --no-update',
  "composer require 'php:>=8.1' --no-update": 'composer --% require "php:>=8.1" --no-update',
  "composer require 'php:>=8.2' --no-update": 'composer --% require "php:>=8.2" --no-update',
  "composer require 'symfony/debug:^4.4.0'": 'composer --% require "symfony/debug:^4.4.0"',
  "composer require 'symfony/debug:^4.4.44'": 'composer --% require "symfony/debug:^4.4.44"',
  "composer require 'symfony/monolog-bridge:^5.4'": 'composer --% require "symfony/monolog-bridge:^5.4"',
  "composer require 'symfony/monolog-bridge:^5.4.52'":
    'composer --% require "symfony/monolog-bridge:^5.4.52"',
  "composer require 'symfony/yaml:^5.4.52'": 'composer --% require "symfony/yaml:^5.4.52"',
  "composer require 'twig/twig:^3.27.0'": 'composer --% require "twig/twig:^3.27.0"',
  "composer require 'vendor/package:>=1.2 <2.0'": 'composer --% require "vendor/package:>=1.2 <2.0"',
  "composer require 'vendor/package:^2.0 || ^3.0'": 'composer --% require "vendor/package:^2.0 || ^3.0"',
};

const inEveryShell = (argv: readonly string[]): Record<Shell, string | null> =>
  Object.fromEntries(SHELLS.map((shell) => [shell, commandLine(argv, shell)])) as Record<
    Shell,
    string | null
  >;

const refused = { posix: null, cmd: null, powershell: null };

describe("an argv in each shell", () => {
  test.each(rows)("$posix", ({ argv, posix, cmd, powershell }) => {
    expect(inEveryShell(argv)).toEqual(
      REFUSED_BY_THE_RULE.has(posix)
        ? refused
        : { posix, cmd, powershell: POWERSHELL_BY_THE_NEW_RULE[posix] ?? powershell },
    );
  });

  test("every row the new rules change is still in the golden", () => {
    const changed = [...REFUSED_BY_THE_RULE, ...Object.keys(POWERSHELL_BY_THE_NEW_RULE)];

    expect(rows.filter((row) => changed.includes(row.posix))).toHaveLength(changed.length);
  });

  test("PowerShell keeps the bare form only when every argument is inside its bare set", () => {
    expect(commandLine(["composer", "update", "symfony/yaml"], "powershell")).toBe(
      "composer update symfony/yaml",
    );
    expect(commandLine(["composer", "require", "a/b:1.0,@dev", "x+y=z"], "powershell")).toBe(
      "composer --% require a/b:1.0,@dev x+y=z",
    );
  });

  test("PowerShell never single-quotes, and cmd.exe double-quotes a pipe after --%", () => {
    expect(inEveryShell(["composer", "require", "a/b|calc"])).toEqual({
      posix: "composer require 'a/b|calc'",
      cmd: 'composer require "a/b|calc"',
      powershell: 'composer --% require "a/b|calc"',
    });
  });

  test("POSIX single-quotes an argument that starts with =, which zsh would expand", () => {
    expect(commandLine(["composer", "require", "=ls"], "posix")).toBe("composer require '=ls'");
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

  test("allows @name, a,b and a/b|c, which PowerShell writes after --%", () => {
    expect(commandLine(["composer", "require", "@name", "a,b", "a/b|c"], "powershell")).toBe(
      'composer --% require @name a,b "a/b|c"',
    );
  });

  test("refuses a command name outside PowerShell's bare set on every shell, which --% would leave unquoted", () => {
    expect(isPrintableArgv(["a|calc", "require", "a/b:^1.0"])).toBe(false);
    expect(inEveryShell(["a|calc", "require", "a/b:^1.0"])).toEqual(refused);
    expect(inEveryShell(["comp oser", "update", "a/b"])).toEqual(refused);
  });

  test("refuses an empty argv", () => {
    expect(isPrintableArgv([])).toBe(false);
  });
});

describe("the name rule of a command the page writes itself (SPEC §5.6)", () => {
  test.each(["symfony/yaml", "vendor/pkg", "a/b|c", "@scope/name"])("passes %s", (name) => {
    expect(isPrintableName(name)).toBe(true);
  });

  test.each([
    ["lockrot's own option", "--no-update"],
    ["a leading dash", "-a/b"],
    ["a character outside the set", "a/b;curl x|sh;#"],
    ["a quote", "a/b'c"],
    ["an empty name", ""],
  ])("refuses %s: %s", (_, name) => {
    expect(isPrintableName(name)).toBe(false);
  });

  test("quotes one argument for POSIX as a command line does", () => {
    expect(posixArgument("symfony/yaml")).toBe("symfony/yaml");
    expect(posixArgument("a/b|c")).toBe("'a/b|c'");
    expect(posixArgument("=x")).toBe("'=x'");
  });
});

describe("every recorded move's commands, as lockrot's golden writes them", () => {
  const withGolden = recordedCases().filter(({ php }) => php !== null);

  test("the recording has moves with commands", () => {
    expect(withGolden.some(({ finding }) => (finding.next_step?.commands.length ?? 0) > 0)).toBe(true);
  });

  test.each(withGolden)("$name", ({ finding, php }) => {
    const argvs = finding.next_step?.commands ?? [];

    expect({
      posix: argvs.map((argv) => commandLine(argv, "posix")),
      cmd: argvs.map((argv) => commandLine(argv, "cmd")),
    }).toEqual({ posix: php?.commands_posix, cmd: php?.commands_cmd });
  });
});
