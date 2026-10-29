import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LOCKROT_OPTIONS } from "../../src/domain/shellArgv";

const CHANGELOG = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");

test("the 0.14.0 Security entry names every option the command argument rule takes", () => {
  const release = CHANGELOG.slice(CHANGELOG.indexOf("## [0.14.0]"));
  const security = release.slice(release.indexOf("### Security"));
  const rule = security.slice(0, security.indexOf("\n- ", security.indexOf("\n- ") + 1));

  for (const [step, options] of Object.entries(LOCKROT_OPTIONS)) {
    for (const option of options) expect(rule, `${step} ${option}`).toContain(`\`${option}\``);
  }
});
