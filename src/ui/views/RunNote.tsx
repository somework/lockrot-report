import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { NoteDetail } from "../../model/types";
import { safeHref } from "../../domain/links";
import {
  noteRepositories,
  repositoryGroups,
  type NoteRepository,
  type NoteRepositoryGroup,
} from "../../domain/run";
import { DisclosureButton, DisclosurePanel, useDisclosure } from "../common/Disclosure";
import { NoWrap, OutLink } from "../common/common";

/** A long list opens on its first repositories; the rest wait for a second click, and print whole. */
const REPOSITORIES_SHOWN = 20;

/** "a, b and c — message": lockrot's message once for every repository that has exactly it. */
function GroupItem({ group }: { group: NoteRepositoryGroup }) {
  return (
    <li>
      {group.names.map((name, i) => (
        <span key={name}>
          {i === 0 ? "" : i === group.names.length - 1 ? " and " : ", "}
          <span className="mono note-repo">{name}</span>
        </span>
      ))}
      {group.message !== null && <span className="note-repo-msg"> — {group.message}</span>}
    </li>
  );
}

/** The repositories a note counts, as lockrot wrote them: text, never a link, and not matched to any
 *  package (Findings already marks the packages whose activity is missing). */
function Repositories({
  index,
  repos,
  children,
}: {
  index: number;
  repos: readonly NoteRepository[];
  children: ComponentChildren;
}) {
  const id = `${useId()}-repos`;
  const buttonId = `${id}-btn`;
  const listId = `${id}-list`;
  const { open, toggle, printed } = useDisclosure(`run-note:${String(index)}`);
  const all = useDisclosure(`run-note:${String(index)}:all`);
  const n = repos.length;
  const { groups, hidden } = repositoryGroups(repos, all.open ? null : REPOSITORIES_SHOWN);
  const capped = n > REPOSITORIES_SHOWN && !printed;
  return (
    <>
      {!printed && (
        <>
          {" "}
          <NoWrap>
            <DisclosureButton
              id={buttonId}
              label={n === 1 ? "Which one" : `Which ${String(n)}`}
              name={n === 1 ? "Which one: the repository" : `Which ${String(n)}: the repositories`}
              open={open}
              controls={id}
              onToggle={toggle}
              className="note-repos-btn"
            />
          </NoWrap>
        </>
      )}
      {children}
      <DisclosurePanel id={id} open={open} className="note-repos" labelledBy={printed ? undefined : buttonId}>
        <ul id={listId} className="note-repos-list">
          {groups.map((group, i) => (
            <GroupItem key={i} group={group} />
          ))}
        </ul>
        {capped && (
          <p className="note-repos-more">
            {hidden > 0 && <>{hidden} more. </>}
            <DisclosureButton
              label={`All ${String(n)}`}
              name={`All ${String(n)} repositories`}
              open={all.open}
              controls={listId}
              onToggle={all.toggle}
            />
          </p>
        )}
      </DisclosurePanel>
    </>
  );
}

/** One run note: lockrot's text, the repositories it counts where its data lists them, its link. */
export function RunNote({
  text,
  detail,
  index,
}: {
  text: string;
  detail: NoteDetail | undefined;
  index: number;
}) {
  const docs = safeHref(detail?.docsUrl ?? null);
  const repos = noteRepositories(detail);
  const link = docs !== null && (
    <>
      {" "}
      <NoWrap>
        <OutLink href={docs}>what this means</OutLink>
      </NoWrap>
    </>
  );
  return (
    <div className="note">
      {text}
      {repos.length > 0 ? (
        <Repositories index={index} repos={repos}>
          {link}
        </Repositories>
      ) : (
        link
      )}
    </div>
  );
}
