import { Fragment } from "preact";
import {
  floorsDefinition,
  type FloorGroup,
  type FloorItem,
  type FloorPart,
  type Floors,
} from "../../domain/floors";
import { DisclosurePanel } from "../common/Disclosure";

/** One key for every package: j/k keeps the reader's choice from one detail to the next. */
export const FLOORS_KEY = "floors";

export function FloorWords({ parts }: { parts: readonly FloorPart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : part.kind === "phrase" ? (
          <span key={i} className="nowrap">
            {part.text}
          </span>
        ) : part.kind === "name" ? (
          <span key={i} className="mono">
            {part.text}
          </span>
        ) : (
          <code key={i} className="detail-timeline-code">
            {part.text}
          </code>
        ),
      )}
    </>
  );
}

function Item({ item }: { item: FloorItem }) {
  if (item.kind === "run") {
    return (
      <span className="floors-run">
        <span className="mono">{item.from}</span> – <span className="mono">{item.to}</span>{" "}
        <span className="floors-count">({item.count})</span>
      </span>
    );
  }
  return (
    <>
      <span className="mono">{item.branch}</span>
      {item.yours && <span className="floors-yours"> (yours)</span>}
    </>
  );
}

/** Level 1 of the branches against the floors: what the words mean, then every branch by standing. */
export function FloorsPanel({
  id,
  open,
  labelledBy,
  floors,
  groups,
}: {
  id: string;
  open: boolean;
  labelledBy: string | undefined;
  floors: Floors;
  groups: readonly FloorGroup[];
}) {
  return (
    <DisclosurePanel id={id} open={open} className="detail-timeline-floors" labelledBy={labelledBy}>
      <p className="floors-def">
        <FloorWords parts={floorsDefinition(floors)} />
      </p>
      <ul className="floors-groups">
        {groups.map((group, g) => (
          <li key={g}>
            {group.items.map((item, i) => (
              <Fragment key={i}>
                {i > 0 && (i === group.items.length - 1 ? " and " : ", ")}
                <Item item={item} />
              </Fragment>
            ))}{" "}
            <FloorWords parts={group.words} />
          </li>
        ))}
      </ul>
    </DisclosurePanel>
  );
}
