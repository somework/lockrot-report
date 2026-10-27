import { execFileSync, spawnSync } from "node:child_process";
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

/** A stand-in for lockrot: a commit on main, a tagged commit off main, and a commit only a branch holds. */
function lockrotRemote(): { remote: string; onMain: string; tagged: string; branchOnly: string } {
  const remote = mkdtempSync(join(tmpdir(), "lockrot-remote-"));
  roots.push(remote);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", remote, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
      encoding: "utf8",
    }).trim();
  const commit = (message: string): string => {
    git("commit", "--quiet", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "--initial-branch=main");
  const onMain = commit("on main");
  git("switch", "--quiet", "-c", "release/1.0");
  const tagged = commit("tagged");
  git("tag", "v1.0.0");
  git("switch", "--quiet", "-c", "integration", "main");
  const branchOnly = commit("on a branch only");
  return { remote, onMain, tagged, branchOnly };
}

function reachable(commit: string, remote: string) {
  const root = rootWithPin({ commit, bundle_sha256: "0", text_grammar: 1, score_text_grammar: 1 });
  return spawnSync(process.execPath, [join(root, "scripts", "contract.mjs"), "reachable"], {
    encoding: "utf8",
    env: { ...process.env, LOCKROT_REMOTE: remote },
  });
}

test("reachable accepts a pin that lockrot's main holds", () => {
  const { remote, onMain } = lockrotRemote();

  const run = reachable(onMain, remote);

  expect(run.status, run.stderr).toBe(0);
});

test("reachable accepts a pin that a lockrot tag holds off main", () => {
  const { remote, tagged } = lockrotRemote();

  const run = reachable(tagged, remote);

  expect(run.status, run.stderr).toBe(0);
});

test("reachable refuses a pin that only a lockrot branch holds", () => {
  const { remote, branchOnly } = lockrotRemote();

  const run = reachable(branchOnly, remote);

  expect(run.status).toBe(1);
  expect(run.stderr).toContain(`lockrot ${branchOnly} is on neither lockrot's main nor a lockrot tag`);
});
