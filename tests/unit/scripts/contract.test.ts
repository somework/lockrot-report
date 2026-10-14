import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A repository root holding only the script and a pin, so a run touches nothing of this checkout. */
function rootWithPin(pin: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "lockrot-contract-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "contract"));
  copyFileSync(join(process.cwd(), "scripts", "contract.mjs"), join(root, "scripts", "contract.mjs"));
  writeFileSync(join(root, "contract", "lockrot.json"), JSON.stringify(pin));
  return root;
}

test("fetch refuses a pinned commit that is not a full commit id, before it runs git", () => {
  const root = rootWithPin({
    commit: "--upload-pack=touch pwned",
    bundle_sha256: "0",
    text_grammar: 1,
    score_text_grammar: 1,
  });

  const run = spawnSync(process.execPath, [join(root, "scripts", "contract.mjs"), "fetch"], {
    encoding: "utf8",
  });

  expect(run.status).toBe(1);
  expect(run.stderr).toContain("full 40-character lockrot commit");
  expect(existsSync(join(root, ".lockrot"))).toBe(false);
});
