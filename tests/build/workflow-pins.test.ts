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

/** The lines from `from` up to the next line at `indent` or shallower. */
function block(lines: readonly string[], from: number, indent: number): string[] {
  const end = lines.findIndex((next, i) => i > from && next.search(/\S/) <= indent);
  return lines.slice(from, end === -1 ? undefined : end);
}

/** The `actions/checkout` steps of one workflow text that leave the job token in .git/config: no
 *  `persist-credentials: false` under the step's own `with:` key. A step runs from its `- ` line to
 *  the next line at the same or a shallower indent. */
function checkoutsKeepingToken(text: string): string[] {
  // A blank or comment-only line ends no block and sets no indent.
  const lines = text.split("\n").filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  return lines.flatMap((line, at) => {
    const head = /^(\s*)- /.exec(line);
    if (head === null) return [];
    const indent = head[1]?.length ?? 0;
    const step = block(lines, at, indent);
    const checkout = /^\s*(-\s+)?uses:\s*["']?actions\/checkout@/m.test(step.join("\n"));
    const withAt = step.findIndex((key) => /^\s*(-\s+)?with:\s*(#.*)?$/.test(key) && key.indexOf("with:") === indent + 2);
    const inputs = withAt === -1 ? [] : block(step, withAt, indent + 2).slice(1);
    const keyIndent = inputs[0]?.search(/\S/);
    const dropsToken = inputs.some(
      (input) =>
        input.search(/\S/) === keyIndent && /^\s+persist-credentials:\s*["']?false["']?\s*(#.*)?$/.test(input),
    );
    return checkout && !dropsToken ? [step.join("\n")] : [];
  });
}

test.each([
  ["- uses: actions/checkout@abc # v7.0.1\n  with:\n    persist-credentials: false", 0],
  ["- name: Checkout\n  uses: actions/checkout@abc # v7.0.1", 1],
  ["- name: Checkout\n  uses: actions/checkout@abc # v7.0.1\n  with:\n    persist-credentials: 'false' # no token", 0],
  ["- uses: actions/checkout@abc # v7.0.1\n- uses: actions/cache@abc # v6.1.0\n  with:\n    persist-credentials: false", 1],
  ["- name: Checkout\n  uses: actions/checkout@abc # v7.0.1\n  env:\n    persist-credentials: 'false'", 1],
  ["- uses: actions/checkout@abc # v7.0.1\n  with:\n    path: |\n      persist-credentials: false", 1],
  ["- uses: actions/checkout@abc # v7.0.1\n  with:\n      # checkout path\n    path: |\n      persist-credentials: false", 1],
  ["- uses: actions/checkout@abc # v7.0.1\n  with:\n    fetch-depth: 0\n    persist-credentials: false", 0],
])("%j keeps the token in %i checkout steps", (text, kept) => {
  expect(checkoutsKeepingToken(text)).toHaveLength(kept);
});

// `npm ci` runs dependency install scripts, which could read a token that checkout left in .git/config.
test("every actions/checkout step sets persist-credentials: false", () => {
  const files = readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
  const checkouts = usesLines().filter((line) => line.includes("actions/checkout@"));

  expect(checkouts.length).toBeGreaterThan(0);
  expect(
    files.flatMap((name) =>
      checkoutsKeepingToken(readFileSync(join(WORKFLOWS, name), "utf8")).map((step) => `${name}: ${step}`),
    ),
  ).toEqual([]);
});
