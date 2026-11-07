import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { licenceBanner } from "../../../scripts/licence-notices.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakePackage(name: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lockrot-licence-"));
  roots.push(root);
  const dir = join(root, "node_modules", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.2.3", license: "MIT" }));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  return join(dir, "dist", "index.js");
}

test("names each bundled package once, with its version, licence id and licence text", () => {
  const scoped = fakePackage("@scope/b", { "LICENSE.md": "B terms\n" });
  const plain = fakePackage("a", { LICENCE: "A terms" });

  const banner = licenceBanner([scoped, plain, plain, "/src/main.ts"]);

  expect(banner).toBe(
    "/*! Third-party software in this file:\n\n@scope/b 1.2.3 (MIT)\n\nB terms\n\na 1.2.3 (MIT)\n\nA terms\n*/\n",
  );
});

test("writes no banner for a chunk with no third-party module", () => {
  expect(licenceBanner(["/repo/src/main.ts"])).toBe("");
});

test("fails the build for a bundled package with no licence file", () => {
  const id = fakePackage("unlicensed", {});

  expect(() => licenceBanner([id])).toThrow(/unlicensed has no licence file/);
});

test("fails the build for a licence text that would close the comment", () => {
  const id = fakePackage("closer", { LICENSE: "terms */ more" });

  expect(() => licenceBanner([id])).toThrow(/closer would close the notice comment/);
});

test.each(["see </script> here", "see </SCRIPT here", "<!-- a note", "a <body> tag", "a {{DATA}} slot"])(
  "fails the build for a licence text that the page or lockrot's template filling would read as markup: %s",
  (text) => {
    const id = fakePackage("marker", { LICENSE: text });

    expect(() => licenceBanner([id])).toThrow(/marker would break the page it is inlined into/);
  },
);

test("names the licence as below when package.json gives no SPDX string", () => {
  const id = fakePackage("legacy", { LICENSE: "Legacy terms" });
  const manifest = join(id, "..", "..", "package.json");
  writeFileSync(manifest, JSON.stringify({ name: "legacy", version: "0.1.0", license: { type: "MIT" } }));

  expect(licenceBanner([id])).toContain("legacy 0.1.0 (see below)\n\nLegacy terms");
});

test("names each copy of a package that two places in node_modules bundle", () => {
  const first = fakePackage("twin", { LICENSE: "Twin terms" });
  const second = fakePackage("twin", { LICENSE: "Twin terms" });

  expect(licenceBanner([first, second]).split("twin 1.2.3 (MIT)").length - 1).toBe(2);
});
