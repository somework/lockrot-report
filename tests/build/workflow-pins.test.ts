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

// A tag can move. The release job attests what it runs, and lockrot trusts that attestation.
test("every third-party workflow action is pinned by a full commit SHA with its version in a comment", () => {
  const lines = usesLines();

  expect(lines.length).toBeGreaterThan(0);
  const thirdParty = lines.filter((line) => !/uses: \.\//.test(line));
  expect(
    thirdParty.filter(
      (line) =>
        !/uses: ([\w.-]+\/[\w./-]+@[0-9a-f]{40}|docker:\/\/\S+@sha256:[0-9a-f]{64}) # v?\d+\.\d+\.\d+$/.test(line),
    ),
  ).toEqual(
    [],
  );
});
