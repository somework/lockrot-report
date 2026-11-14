import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { SourceMap, type SourceMapPayload } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";
import { afterAll, expect, test } from "vitest";

const outDir = mkdtempSync(join(tmpdir(), "lockrot-sourcemap-"));

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

test("a source-mapped build maps each code line to its own source line, below the licence notice", async () => {
  await build({ logLevel: "silent", build: { outDir, emptyOutDir: true, sourcemap: true } });
  const lines = readFileSync(join(outDir, "lockrot-report.js"), "utf8").split("\n");
  const map = new SourceMap(
    JSON.parse(readFileSync(join(outDir, "lockrot-report.js.map"), "utf8")) as SourceMapPayload,
  );
  const line = lines.findIndex((text) => text.includes('getElementById("lockrot-data")'));
  const column = lines[line]?.indexOf("getElementById") ?? -1;

  const sourceLine = readFileSync(join(process.cwd(), "src", "main.ts"), "utf8")
    .split("\n")
    .findIndex((text) => text.includes('getElementById("lockrot-data")'));

  const entry = map.findEntry(line, column);

  expect(lines[0]).toBe("/*! Third-party software in this file:");
  expect("originalSource" in entry && entry.originalSource).toMatch(/src\/main\.ts$/);
  expect("originalLine" in entry && entry.originalLine).toBe(sourceLine);
}, 120_000);
