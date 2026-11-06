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

test("each version heading links the compare view from the next older version, the oldest its tag", () => {
  const headings = [...CHANGELOG.matchAll(/^## \[([^\]]+)\]/gm)].map(([, label = ""]) => label);
  const links = Object.fromEntries(
    [...CHANGELOG.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)].map(([, label = "", url = ""]) => [label, url]),
  );
  const repo = "https://github.com/somework/lockrot-report";
  const ref = (label: string): string => (label === "Unreleased" ? "HEAD" : `v${label}`);
  const expected = Object.fromEntries(
    headings.map((label, at) => {
      const older = headings[at + 1];
      return [
        label,
        older === undefined
          ? `${repo}/releases/tag/${ref(label)}`
          : `${repo}/compare/${ref(older)}...${ref(label)}`,
      ];
    }),
  );

  expect(links).toEqual(expected);
});
