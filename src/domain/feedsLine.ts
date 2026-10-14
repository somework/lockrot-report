import type { Finding } from "../model/report2";
import { feedAnswerWord } from "./pageVocabulary";

/** `packagist.org (1 on record), repo.example (lookup failed)`, or `null` when no feed was asked. */
export function feedsLine(finding: Finding): string | null {
  const { feeds } = finding.security;
  if (feeds.length === 0) return null;
  return feeds
    .map(
      (feed) => `${feed.registry ?? feed.composer_repository} (${feedAnswerWord(feed, finding.origin.kind)})`,
    )
    .join(", ");
}
