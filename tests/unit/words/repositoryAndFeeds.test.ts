import { describe, expect, test } from "vitest";

import { feedsLine } from "../../../src/domain/feedsLine";
import { repositoryLine } from "../../../src/domain/repositoryLine";
import type { Finding } from "../../../src/model/report";
import { modelCases } from "./recorded";

const finding = (name: string): Finding => {
  const found = modelCases().find((model) => model.name === name);
  if (found === undefined) throw new Error(`no case ${name}`);
  return found.finding;
};

// The expected lines are SPEC §7.7 and §7.9.8's own examples.
describe("the Repository line", () => {
  test("a repository that was read names the forge, the last push and when it was fetched", () => {
    expect(repositoryLine(finding("B"))).toBe(
      "GitHub github.com/symfony/monolog-bridge: last push 2026-09-23 · fetched 2026-10-01 (cached 2026-10-01)",
    );
  });

  test("an archived flag that was not read says why", () => {
    expect(repositoryLine(finding("gitlab-anon-dagger"))).toBe(
      "GitLab gitlab.com/hoaproject/Consistency: last commit 2021-04-28, archived flag not read (no token) · fetched 2026-10-01 (cached 2026-10-01)",
    );
  });

  test("a host that answered 404 is not a repository lockrot read", () => {
    expect(repositoryLine(finding("not-found-dagger"))).toBe(
      "GitHub github.com/hoaproject/Consistency: the host answered 404 (private, renamed or removed)",
    );
  });

  test("a host lockrot cannot ask is named", () => {
    expect(repositoryLine(finding("host-unsupported"))).toBe(
      "lockrot cannot ask codeberg.org about repository activity",
    );
  });

  test.each(modelCases())("$name prints no None, null or empty host", ({ finding: each }) => {
    expect(repositoryLine(each)).not.toMatch(/None|null|undefined|\s\/|^\//);
  });

  test("a repository that was not asked says why, with or without a repository", () => {
    const base = finding("host-unsupported");
    const withRepository = {
      ...base,
      activity: { ...base.activity, reason: "allowlisted", repo: "owner/name" },
    } as Finding;
    const withoutRepository = { ...base, activity: { ...base.activity, reason: "allowlisted" } } as Finding;

    expect([repositoryLine(withRepository), repositoryLine(withoutRepository)]).toEqual([
      "codeberg.org/owner/name: not asked (allowlisted)",
      "Repository activity not asked (allowlisted)",
    ]);
  });
});

describe("the Advisory feeds line", () => {
  test("a feed names its registry and what it answered", () => {
    expect(feedsLine(finding("B"))).toBe("packagist.org (1 on record)");
  });

  test("a finding with no feed has no line", () => {
    const base = finding("B");

    expect(feedsLine({ ...base, security: { ...base.security, feeds: [] } })).toBeNull();
  });

  test("a feed with no registry is named by its repository", () => {
    const base = finding("B");
    const feeds = base.security.feeds.map((feed) => ({
      ...feed,
      registry: null,
      composer_repository: "https://repo.example",
    }));

    expect(feedsLine({ ...base, security: { ...base.security, feeds } })).toBe(
      "https://repo.example (1 on record)",
    );
  });
});
