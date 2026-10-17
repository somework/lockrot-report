import { useId } from "preact/hooks";
import type { Run } from "../../model/report";
import { DETAIL_WORDS } from "../../domain/detailWords";
import { gradeTone, verdictTone } from "../../domain/findingRow";
import { type Holder, type HeldByBlock, type MoveCard as Card, STEP_LABEL } from "../../domain/moveCards";
import { toneClass } from "../common/common";
import { usePrinted } from "../print/printContext";
import { CopyMove } from "./CopyMove";
import { RichText } from "./RichText";

function Fact({
  label,
  children,
  lines = false,
}: {
  label: string;
  children: preact.ComponentChildren;
  lines?: boolean;
}) {
  return (
    <div className="d3-mf">
      <dt>{label}</dt>
      <dd className={lines ? "d3-mf-lines" : undefined}>{children}</dd>
    </div>
  );
}

/** A Then card's heading is "Then"; the lead card's "The move" or, with no release or command, "Next step". */
export function MoveCard({ card, run }: { card: Card; run: Run }) {
  const id = `${useId()}-move`;
  const { php, after } = card;
  const classes = ["d3-move", ...(card.advice ? ["is-advice"] : []), ...(card.then ? ["is-then"] : [])].join(
    " ",
  );
  return (
    <section className={classes} aria-labelledby={id}>
      <h3 className="eyebrow" id={id}>
        {card.heading}
      </h3>
      <p className="d3-move-action">
        <RichText rich={card.action} />
      </p>
      {card.argvs.length > 0 && <CopyMove argvs={card.argvs} className="d3-cmd" />}
      <dl className="d3-move-facts">
        {card.clears !== null && <Fact label={DETAIL_WORDS.clears}>{card.clears}</Fact>}
        {card.stays !== null && <Fact label={DETAIL_WORDS.stays}>{card.stays}</Fact>}
        {card.notChecked !== null && <Fact label={DETAIL_WORDS.notChecked}>{card.notChecked}</Fact>}
        {card.adds.length > 0 && (
          <Fact label={DETAIL_WORDS.adds} lines>
            {card.adds.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </Fact>
        )}
        {php !== null && (
          <Fact label={DETAIL_WORDS.php}>
            {php.head !== null && (
              <span>
                <RichText rich={php.head} />
              </span>
            )}
            {php.lines.map(({ answer, text }) => (
              <span key={text} className={`d3-check is-${answer}`}>
                <span className="d3-check-mark" aria-hidden="true">
                  {answer === "yes" ? "✓" : "✕"}
                </span>
                <span className="vh">{answer === "yes" ? DETAIL_WORDS.yes : DETAIL_WORDS.no}</span>
                {text}
              </span>
            ))}
          </Fact>
        )}
        {after !== null && (
          <Fact label={DETAIL_WORDS.after}>
            <span className={`d2-after ${toneClass(verdictTone(run.score_model, after.verdict))}`}>
              {after.result}
            </span>
            {after.conditions.map((condition) => (
              <span key={condition} className="d3-after-cond">
                {condition}
              </span>
            ))}
          </Fact>
        )}
      </dl>
      {card.composer.length > 0 && (
        <div className="d3-notes">
          <p className="d3-notes-label">{DETAIL_WORDS.composer}</p>
          <ul>
            {card.composer.map((note, i) => (
              <li key={i}>
                <RichText rich={note.text} />
                {note.items.length > 0 && (
                  <ul className="d3-notes-sub">
                    {note.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function HolderItem({ holder }: { holder: Holder }) {
  const tone = holder.grade === null ? null : toneClass(gradeTone(holder.grade));
  const classes = [
    "d3-holder",
    ...(holder.root ? ["is-root"] : []),
    ...(tone === null ? [] : ["is-graded", tone]),
  ];
  return (
    <li className={classes.join(" ")}>
      <div className="d3-holder-name">
        <span className="d3-holder-pkg">{holder.name}</span>
        {holder.version !== null && (
          <>
            {" "}
            <span className="d3-holder-ver">{holder.version}</span>
          </>
        )}
        {holder.grade !== null && (
          <>
            {" "}
            <span className={`tag ${tone ?? ""}`}>{holder.grade}</span>
          </>
        )}
      </div>
      <div className="d3-holder-meta">
        <RichText rich={holder.meta} />
      </div>
      {holder.step !== null && (
        <div className="d3-holder-step">
          <span className="d3-holder-step-label">{STEP_LABEL}</span> {holder.step}
        </div>
      )}
    </li>
  );
}

/** Held by (SPEC §7.9.8.7): every holder up to HOLDERS_SHOWN_MAX, else the worst and a fold. */
export function HeldBy({ block }: { block: HeldByBlock }) {
  const id = `${useId()}-held`;
  const printed = usePrinted();
  return (
    <section className="d3-holders" aria-labelledby={id}>
      <h3 className="eyebrow" id={id}>
        {DETAIL_WORDS.heldBy}
        {block.count > 1 && <span className="d3-count">{` · ${block.count}`}</span>}
        {block.then !== null && <span className="vh">{block.then}</span>}
      </h3>
      <ul className="d3-chain">
        {block.shown.map((holder, i) => (
          <HolderItem key={i} holder={holder} />
        ))}
      </ul>
      {block.fold !== null && (
        <details className="d3-fold" open={printed ? true : undefined}>
          <summary>
            <span>{block.fold.summary}</span>
          </summary>
          <ul className="d3-chain is-quiet">
            {block.fold.holders.map((holder, i) => (
              <HolderItem key={i} holder={holder} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
