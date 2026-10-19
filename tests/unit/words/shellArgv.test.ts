import { describe, expect, test } from "vitest";

import {
  commandLine,
  commandWords,
  isPrintableArgv,
  isPrintableName,
  posixArgument,
  SHELLS,
  type Shell,
} from "../../../src/domain/shellArgv";
import { readContractJson, recordedCases } from "./recorded";

interface Row {
  argv: string[];
  posix: string | null;
  cmd: string | null;
  powershell: string | null;
}

const { rows } = readContractJson("en", "commands.json") as { rows: Row[] };

const inEveryShell = (argv: readonly string[]): Record<Shell, string | null> =>
  Object.fromEntries(SHELLS.map((shell) => [shell, commandLine(argv, shell)])) as Record<
    Shell,
    string | null
  >;

const refused = { posix: null, cmd: null, powershell: null };

describe("an argv in each shell", () => {
  test("the golden holds rows the rule refuses and rows it passes", () => {
    expect(rows.filter((row) => row.posix === null).length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.posix !== null).length).toBeGreaterThan(0);
  });

  test.each(rows.map((row) => [JSON.stringify(row.argv), row] as const))("%s", (_, row) => {
    expect(inEveryShell(row.argv)).toEqual({ posix: row.posix, cmd: row.cmd, powershell: row.powershell });
  });

  test("PowerShell always writes composer, then --%, then the cmd.exe form of the rest", () => {
    expect(commandLine(["composer", "update", "symfony/yaml"], "powershell")).toBe(
      "composer --% update symfony/yaml",
    );
    expect(commandLine(["composer", "why-not", "a/b", "1.10"], "powershell")).toBe(
      "composer --% why-not a/b 1.10",
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

describe("the words of a command line", () => {
  test("keep an argument with spaces as one word, so a line breaks only between arguments", () => {
    const argv = ["composer", "require", "symfony/yaml:^5.4 || ^6.0"];

    expect(commandWords(argv, "posix")).toEqual(["composer", "require", "'symfony/yaml:^5.4 || ^6.0'"]);
    expect(commandWords(argv, "powershell")).toEqual([
      "composer",
      "--%",
      "require",
      '"symfony/yaml:^5.4 || ^6.0"',
    ]);
    expect(commandWords(argv, "posix")?.join(" ")).toBe(commandLine(argv, "posix"));
  });

  test("are null for an argv the rule refuses", () => {
    expect(commandWords(["composer", "require", "a/b:%PATH%"], "posix")).toBeNull();
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
    ["an argument of spaces only", "   "],
    ["a bare --%", "--%"],
    ["an option from the data", "--working-dir=x"],
    ["a short option from the data", "-d"],
  ])("refuses %s on every shell", (_, argument) => {
    expect(isPrintableArgv(["composer", "require", argument])).toBe(false);
    expect(inEveryShell(["composer", "require", argument])).toEqual(refused);
  });

  test("allows an argument with spaces between other characters", () => {
    expect(isPrintableArgv(["composer", "require", "a/b:>=1.2 <2.0"])).toBe(true);
  });

  test("allows lockrot's own --no-update option in a require step only", () => {
    expect(isPrintableArgv(["composer", "require", "php:>=8.1", "--no-update"])).toBe(true);
    expect(inEveryShell(["composer", "update", "a/b", "--no-update"])).toEqual(refused);
    expect(inEveryShell(["composer", "why-not", "a/b", "--no-update"])).toEqual(refused);
  });

  test.each([
    ["update", "--with-dependencies"],
    ["update", "--with-all-dependencies"],
    ["require", "--with-dependencies"],
    ["require", "--with-all-dependencies"],
  ])("allows lockrot's %s option %s after the package", (subcommand, option) => {
    expect(isPrintableArgv(["composer", subcommand, "a/b:^2.0", option])).toBe(true);
  });

  test.each([
    ["an option before the package", ["composer", "update", "--with-dependencies", "a/b"]],
    ["a package after an option", ["composer", "update", "a/b", "--with-dependencies", "c/d"]],
    ["an option with no package", ["composer", "require", "--no-update"]],
    ["the option of a why-not step", ["composer", "why-not", "a/b", "--with-dependencies"]],
  ])("refuses %s on every shell", (_, argv) => {
    expect(inEveryShell(argv)).toEqual(refused);
  });

  test("allows @name, a,b and a/b|c, which PowerShell writes after --%", () => {
    expect(commandLine(["composer", "require", "@name", "a,b", "a/b|c"], "powershell")).toBe(
      'composer --% require @name a,b "a/b|c"',
    );
  });

  test.each([
    ["another program", ["iex", "calc"]],
    ["a program that passes the set", ["a,b", "update", "a/b"]],
    ["an option as the program", ["-x", "update", "a/b"]],
    ["another subcommand", ["composer", "exec", "calc"]],
    ["the subcommand missing", ["composer"]],
    ["an empty argv", []],
  ])("refuses %s on every shell", (_, argv) => {
    expect(isPrintableArgv(argv)).toBe(false);
    expect(inEveryShell(argv)).toEqual(refused);
  });

  test.each(["update", "require", "why-not"])("allows the subcommand %s", (subcommand) => {
    expect(isPrintableArgv(["composer", subcommand, "a/b"])).toBe(true);
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
