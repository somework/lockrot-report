import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LOCKROT_OPTIONS } from "../../src/domain/shellArgv";

const CHANGELOG = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");

test("the 0.14.0 Security entry names every option the command argument rule takes", () => {
  const release = CHANGELOG.slice(CHANGELOG.indexOf("## [0.14.0]"));
  const security = release.slice(release.indexOf("### Security"));
  const start = security.indexOf("command argument rule");
  const rule = security.slice(start, security.indexOf("\n- ", start));
  const options = [...new Set(Object.values(LOCKROT_OPTIONS).flatMap((set) => [...set]))];

  expect(options.filter((option) => !rule.includes(`\`${option}\``))).toEqual([]);
});
