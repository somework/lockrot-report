import type { RadiusCard as RadiusCardModel, RadiusPulled } from "../../domain/radius";
import { useReport } from "../context";
import { applyFilters } from "../../domain/filters";
import { radiusCards } from "../../domain/radius";
import { plural } from "../../domain/format";
import { Pill } from "../common/common";
import { rowInteractions } from "./FindingRow";
import "./views.css";

/** One package a card's direct requirement drags in — a small list item that opens that package's
 *  detail, never a bare navigation link. A list item like the Findings rows, so every view's rows
 *  share one role and one way of marking the open one (`aria-current`). */
function PulledRow({ pulled }: { pulled: RadiusPulled }) {
  const { state, dispatch } = useReport();
  const isOpen = state.pkg === pulled.package;

  return (
    <li
      tabIndex={0}
      aria-current={isOpen ? "true" : undefined}
      aria-label={pulled.package}
      data-pkg={pulled.package}
      className="pulled-row"
      {...rowInteractions(pulled.package, isOpen, dispatch)}
    >
      <span className="arrow">→</span>
      <span className="pkg-link-btn">{pulled.package}</span>
      <Pill word={pulled.verdict} />
    </li>
  );
}

/** One direct requirement's card: how much of the report's rot sits underneath it. `count` and the
 *  rows below it always agree (DESIGN.md §5 M24/M25 — legacy's own count could exceed its own rows,
 *  or come from a different attribution than the document's `exposure[].flagged`). */
function RadiusCardView({ card }: { card: RadiusCardModel }) {
  return (
    <article className="card">
      <h3>{card.package}</h3>
      <div className="meter">
        <i style={{ width: `${card.meterPercent}%` }} />
      </div>
      <span className="eyebrow">{plural(card.count, "flagged package", "flagged packages")} underneath</span>
      {card.pulled.length > 0 ? (
        <ul className="pulled-list" aria-label={`Pulled in by ${card.package}`}>
          {card.pulled.map((pulled) => (
            <PulledRow key={pulled.package} pulled={pulled} />
          ))}
        </ul>
      ) : (
        <span className="pulled-empty">flagged itself</span>
      )}
    </article>
  );
}

/** The Blast radius tab: which direct requirements drag flagged packages in, ranked by how much —
 *  ported from legacy `viewRadius` (report.js:595-625), fixed per DESIGN.md §5 M24/M25. */
export function RadiusView() {
  const { model, state } = useReport();
  const flagged = applyFilters(model, state, "radius");
  const cards = radiusCards(model, flagged);

  if (cards.length === 0) {
    return <p className="empty">No direct requirement drags a flagged package in.</p>;
  }

  return (
    <div>
      <p className="radius-note">
        Direct requirements ranked by how much rot each one brings with it. Fixing the parent is often cheaper
        than chasing the child.
      </p>
      <div className="cards">
        {cards.map((card) => (
          <RadiusCardView key={card.package} card={card} />
        ))}
      </div>
    </div>
  );
}
