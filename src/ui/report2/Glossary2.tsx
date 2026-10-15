import {
  flagEntries,
  flagsHeading,
  GLOSSARY2_WORDS,
  signalEntries,
  verdictEntries,
  verdictsHeading,
  VERDICTS_DOCS,
  type GlossaryEntry,
} from "../../domain/glossary2";
import { gradeTone } from "../../domain/findingRow2";
import { signalDocUrl } from "../../domain/vocab";
import { OutLink, toneClass } from "../common/common";
import { ScoreModelLink } from "./ScoreModelLink";
import { useReport2 } from "./useReport2";

function Entries({ entries, toned }: { entries: readonly GlossaryEntry[]; toned: boolean }) {
  return (
    <dl className="deflist">
      {entries.map(({ id, count, text }) => [
        <dt
          key={`t-${id}`}
          data-term={id}
          className={toned ? `term-toned ${toneClass(gradeTone(id))}` : undefined}
        >
          {id}
          {count !== null && count > 0 && <span className="muted"> {count}</span>}
        </dt>,
        <dd key={`d-${id}`}>{text}</dd>,
      ])}
    </dl>
  );
}

/** The glossary's sections on a report-2 document: the verdicts in view, every other one folded. */
export function GlossaryBody2({ onClose }: { onClose: () => void }) {
  const { report } = useReport2();
  const { run } = report;
  const graded: readonly string[] = run.graded_verdicts;
  const verdicts = verdictEntries(report);
  return (
    <div className="glossary-body">
      <section className="glossary-sect">
        <h3>{verdictsHeading(run)}</h3>
        <Entries entries={verdicts.filter(({ id }) => graded.includes(id))} toned />
        <Entries entries={verdicts.filter(({ id }) => !graded.includes(id))} toned={false} />
        <p className="small-note">
          <OutLink href={VERDICTS_DOCS}>{GLOSSARY2_WORDS.docs}</OutLink>
        </p>
      </section>
      <details className="glossary-sect" open>
        <summary>
          <h3>{flagsHeading(run)}</h3>
        </summary>
        <Entries entries={flagEntries(report)} toned={false} />
        <p className="prose">
          {GLOSSARY2_WORDS.score}{" "}
          <span onClick={onClose}>
            <ScoreModelLink />
          </span>
        </p>
      </details>
      <details className="glossary-sect">
        <summary>
          <h3>The signals</h3>
        </summary>
        <dl className="deflist">
          {signalEntries(run).map(({ id, name, text }) => {
            const doc = signalDocUrl(id);
            return [
              <dt key={`t-${id}`}>
                {id}{" "}
                {doc === null ? (
                  <span className="term-name">{name}</span>
                ) : (
                  <OutLink href={doc}>{name}</OutLink>
                )}
              </dt>,
              <dd key={`d-${id}`}>{text}</dd>,
            ];
          })}
        </dl>
      </details>
      <details className="glossary-sect">
        <summary>
          <h3>One number for the lock: libyears</h3>
        </summary>
        <p className="prose">{GLOSSARY2_WORDS.libyears}</p>
      </details>
      <details className="glossary-sect">
        <summary>
          <h3>Keys and search</h3>
        </summary>
        <p className="prose">
          <kbd>/</kbd> to search · <kbd>j</kbd> <kbd>k</kbd> to move · <kbd>Enter</kbd> to open ·{" "}
          <kbd>Esc</kbd> to close · <kbd>?</kbd> for this glossary.
        </p>
        <p className="prose">
          {GLOSSARY2_WORDS.search}{" "}
          {GLOSSARY2_WORDS.searchKeys.map((key) => (
            <code key={key}>{key} </code>
          ))}
        </p>
      </details>
      <details className="glossary-sect">
        <summary>
          <h3>For the lock's maintainers: accepting a package</h3>
        </summary>
        <p className="prose glossary-note">{GLOSSARY2_WORDS.accept}</p>
      </details>
    </div>
  );
}
