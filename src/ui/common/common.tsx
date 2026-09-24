import type { ComponentChildren } from "preact";
import { useId, useRef } from "preact/hooks";
import { safeHref } from "../../domain/links";
import { DOCS_URL, TONE, VERDICT_DEFS, type Tone } from "../../domain/vocab";
import { useReport } from "../context";
import "./common.css";

/**
 * The small pieces every surface uses. Tone is a class, never an inline style: the page runs under
 * a CSP that pins its one stylesheet by hash, and a `style="…"` attribute in markup would be refused
 * (DESIGN.md §1.3). The tone classes are defined once, in styles/base.css.
 */

export function toneClass(tone: Tone): string {
  return `tone-${tone}`;
}

/** A verdict or priority word in its tone. `docs` gives it a popover holding the definition. */
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

  return <DocsPill word={word} className={className} title={title} />;
}

/**
 * PD-GLOSSARY-4: this used to be an `<a>` out to lockrot.dev — useless offline, and a report opened
 * from a PHAR or a file:// path has no network at all (DESIGN.md §1.1). A native popover holds the
 * same definition the glossary would give it, in place, plus a way into the full glossary and the
 * lockrot.dev link for whoever does have it open. `useId` keeps every instance's popover unique, so
 * two pills for the same verdict on screen at once (a Findings row and its open detail) don't fight
 * over which is `popovertarget`'s match.
 *
 * A `<button popovertarget>` is a control (`ui/keyboard.ts`'s `CONTROLS` already matches `button`),
 * so Enter on the pill activates it instead of toggling whatever row it sits in (M5), and the row's
 * own click guard is widened to ignore it and its popover in `views/FindingRow.tsx`.
 *
 * a11y review: "In the glossary" carries `popovertargetaction="hide"`, which hides this popover — the
 * button's own ancestor — in the same click, before Preact's `onClick` handler runs; by the time the
 * glossary's dialog would read `document.activeElement` to remember who to give focus back to, this
 * button is already display:none and focus has already fallen to `<body>`. `pillRef` holds the pill
 * itself (still visible, still in the row) instead, and `openGlossaryFrom` passes it through so the
 * glossary returns focus there on close, not to `<body>` (`Glossary.tsx#useDialog`).
 */
function DocsPill({
  word,
  className,
  title,
}: {
  word: string;
  className: string;
  title: string | undefined;
}) {
  const id = useId();
  const pillRef = useRef<HTMLButtonElement>(null);
  const { openGlossaryFrom } = useReport();

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className={className}
        title={title}
        popovertarget={id}
        popovertargetaction="toggle"
      >
        {word}
      </button>
      <div id={id} popover="auto" className={`pill-pop ${toneClass(TONE(word))}`}>
        <p className="pill-pop-word">{word}</p>
        <p className="pill-pop-def">{title}</p>
        <div className="pill-pop-actions">
          <button
            type="button"
            className="pill-pop-action"
            popovertarget={id}
            popovertargetaction="hide"
            onClick={() => {
              openGlossaryFrom(pillRef.current);
            }}
          >
            In the glossary
          </button>
          <OutLink href={`${DOCS_URL}#the-nine-verdicts`}>lockrot.dev</OutLink>
        </div>
      </div>
    </>
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
