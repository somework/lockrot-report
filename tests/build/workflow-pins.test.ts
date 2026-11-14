import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows");

const usesLines = (): string[] =>
  readdirSync(WORKFLOWS)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) =>
      readFileSync(join(WORKFLOWS, name), "utf8")
        .split("\n")
        .filter((line) => /^\s*(-\s+)?uses:/.test(line))
        .map((line) => `${name}: ${line.trim()}`),
    );

const PINNED =
  /^([\w.-]+\/[\w./-]+@[0-9a-f]{40}|docker:\/\/\S+@sha256:[0-9a-f]{64})\s+# v?\d+\.\d+\.\d+$/;

/** Whether a `uses:` line runs a local action or names a full SHA with its version in a comment. */
function isPinned(line: string): boolean {
  const value = /uses:\s*(.*)$/.exec(line)?.[1] ?? "";
  return value.startsWith("./") || PINNED.test(value);
}

test.each([
  ["- uses: ./.github/actions/setup", true],
  ["- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1", true],
  ["- uses: actions/checkout@main # uses: ./checkout", false],
  ["- uses: actions/checkout@v7 # v7.0.1", false],
  ["- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", false],
])("%s is pinned: %s", (line, pinned) => {
  expect(isPinned(line)).toBe(pinned);
});

// A tag can move. The release job attests what it runs, and lockrot trusts that attestation.
test("every third-party workflow action is pinned by a full commit SHA with its version in a comment", () => {
  const lines = usesLines();

  expect(lines.length).toBeGreaterThan(0);
  expect(lines.filter((line) => !isPinned(line))).toEqual([]);
});

/** Each `actions/checkout` step as `file: text`, from its `uses:` line to the next step or a shallower line. */
function checkoutSteps(): string[] {
  return readdirSync(WORKFLOWS)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) => {
      const lines = readFileSync(join(WORKFLOWS, name), "utf8").split("\n");
      return lines.flatMap((line, at) => {
        const head = /^(\s*)- uses: actions\/checkout@/.exec(line);
        if (head === null) return [];
        const indent = head[1]?.length ?? 0;
        const end = lines.findIndex(
          (next, i) => i > at && next.trim() !== "" && next.search(/\S/) <= indent,
        );
        return [`${name}: ${lines.slice(at, end === -1 ? undefined : end).join("\n")}`];
      });
    });
}

// `npm ci` runs dependency install scripts, which could read a token that checkout left in .git/config.
test("every actions/checkout step sets persist-credentials: false", () => {
  const steps = checkoutSteps();

  expect(steps.length).toBeGreaterThan(0);
  expect(steps.filter((step) => !/^\s+persist-credentials: false$/m.test(step))).toEqual([]);
});
