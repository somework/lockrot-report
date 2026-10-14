import { describe, expect, test } from "vitest";

import { argvCmd, argvPosix, argvPowershell } from "../../../src/domain/shellArgv";
import { readContractJson } from "./recorded";

interface Row {
  argv: string[];
  posix: string;
  cmd: string;
  powershell: string;
}

const { rows } = readContractJson<{ rows: Row[] }>("en", "commands.json");

describe("an argv in each shell", () => {
  test.each(rows)("$posix", ({ argv, posix, cmd, powershell }) => {
    expect({ posix: argvPosix(argv), cmd: argvCmd(argv), powershell: argvPowershell(argv) }).toEqual({
      posix,
      cmd,
      powershell,
    });
  });

  test("an empty argument is quoted in every shell, so it stays an argument", () => {
    expect([argvPosix(["a", ""]), argvCmd(["a", ""]), argvPowershell(["a", ""])]).toEqual([
      "a ''",
      'a ""',
      "a ''",
    ]);
  });

  test("a double quote is doubled for cmd.exe, and a percent sign is quoted", () => {
    expect(argvCmd(["say", 'a"b', "50%"])).toBe('say "a""b" "50%"');
  });
});
