import type { ComponentChildren } from "preact";
import { safeHref } from "../../domain/links";
import { DOCS_URL, TONE, VERDICT_DEFS, type Tone } from "../../domain/vocab";

/**
 * The small pieces every surface uses. Tone is a class, never an inline style: the page runs under
 * a CSP that pins its one stylesheet by hash, and a `style="…"` attribute in markup would be refused
 * (DESIGN.md §1.3). The tone classes are defined once, in styles/base.css.
 */

export function toneClass(tone: Tone): string {
  return `tone-${tone}`;
}

/** A verdict or priority word in its tone. `docs` links it to the glossary on lockrot.dev. */
export function Pill({ word, docs = false }: { word: string; docs?: boolean }) {
  const className = `pill ${toneClass(TONE(word))}`;
  const title = VERDICT_DEFS[word];
  if (!docs) {
    return (
      <span className={className} title={title}>
        {word}
      </span>
    );
  }

  return (
    <a
      className={className}
      title={title}
      href={`${DOCS_URL}#the-nine-verdicts`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {word}
    </a>
  );
}

/** A neutral label: direct, transitive, require-dev, a baseline state, an advisory count. */
export function Tag({ children, tone, title }: { children: ComponentChildren; tone?: Tone; title?: string }) {
  return (
    <span className={tone ? `tag ${toneClass(tone)}` : "tag"} title={title}>
      {children}
    </span>
  );
}

/**
 * A link that leaves the page. The URL is checked again here whatever produced it: a document is
 * data, and the one place a value becomes an `href` is where a `javascript:` URL has to stop. When
 * the check fails the text is still shown, unlinked.
 */
export function OutLink({ href, children }: { href: string | null; children: ComponentChildren }) {
  const safe = safeHref(href);
  if (safe === null) return <span className="out">{children}</span>;

  return (
    <a className="out" href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** A date or version that must not break across lines. */
export function NoWrap({ children }: { children: ComponentChildren }) {
  return <span className="nowrap">{children}</span>;
}

/** Secondary text: counts, separators, "not measured". */
export function Muted({ children, title }: { children: ComponentChildren; title?: string }) {
  return (
    <span className="muted" title={title}>
      {children}
    </span>
  );
}
