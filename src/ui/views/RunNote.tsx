import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { NoteDetail } from "../../model/types";
import { safeHref } from "../../domain/links";
import { noteRepositories } from "../../domain/run";
import { DisclosureButton, DisclosurePanel, useDisclosure } from "../common/Disclosure";
import { NoWrap, OutLink } from "../common/common";

/** The repositories a note counts, as lockrot wrote them: text, never a link, and not matched to any
 *  package (Findings already marks the packages whose activity is missing). */
function Repositories({
  index,
  repos,
  children,
}: {
  index: number;
  repos: ReturnType<typeof noteRepositories>;
  children: ComponentChildren;
}) {
  const id = `${useId()}-repos`;
  const buttonId = `${id}-btn`;
  const { open, toggle, printed } = useDisclosure(`run-note:${String(index)}`);
  const n = repos.length;
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
        <ul className="note-repos-list">
          {repos.map((repo, i) => (
            <li key={i}>
              <span className="mono note-repo">{repo.name}</span>
              {repo.message !== null && <span className="note-repo-msg"> — {repo.message}</span>}
            </li>
          ))}
        </ul>
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
