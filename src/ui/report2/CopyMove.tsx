import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { Finding } from "../../model/report2";
import { DETAIL_WORDS } from "../../domain/detailWords";
import { commandLine, REFUSED_COMMAND, SHELL_NAMES, SHELLS, type Shell } from "../../domain/shellArgv";

/** Beside `lockrot-theme`: one viewer's choice, kept in their own browser only. */
export const SHELL_KEY = "lockrot-shell";

const COPIED_MS = 1400;
const FAILED_MS = 2600;

type Status = "idle" | "copied" | "manual";

function readShell(): Shell {
  try {
    const saved = window.localStorage.getItem(SHELL_KEY);
    return SHELLS.find((shell) => shell === saved) ?? "posix";
  } catch {
    return "posix";
  }
}

function saveShell(shell: Shell): void {
  try {
    window.localStorage.setItem(SHELL_KEY, shell);
  } catch {
    // Not persisted: the choice still holds for this page view.
  }
}

function useCopyStatus(): [Status, (status: Status) => void] {
  const [status, setStatus] = useState<Status>("idle");
  useEffect(() => {
    if (status === "idle") return undefined;
    const timer = window.setTimeout(
      () => {
        setStatus("idle");
      },
      status === "copied" ? COPIED_MS : FAILED_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);
  return [status, setStatus];
}

const LABELS: Readonly<Record<Status, string>> = {
  idle: DETAIL_WORDS.copy,
  copied: DETAIL_WORDS.copied,
  manual: DETAIL_WORDS.copyByHand,
};

/** The move's commands for one shell; `null` stands for a command the page refuses to print. */
const linesFor = (argvs: readonly (readonly string[])[], shell: Shell): (string | null)[] =>
  argvs.map((argv) => commandLine(argv, shell));

/**
 * The copy control of design 5C: a Copy button and a shell menu, POSIX first. It renders
 * `next_step.commands[]` as written, and for an argv the argument rule refuses it prints why in
 * place of the command and offers no copy, so a reader never runs part of a move.
 */
export function CopyMove({ finding }: { finding: Finding }) {
  const argvs = finding.next_step?.commands ?? [];
  const [shell, setShell] = useState<Shell>(readShell);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useCopyStatus();
  const menuId = `${useId()}-shells`;
  const shellButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent): void => {
      const root = menu.current?.parentElement;
      if (root && event.target instanceof Node && !root.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
    };
  }, [menuOpen]);

  if (argvs.length === 0) return null;
  const lines = linesFor(argvs, shell);
  const printable = lines.every((line) => line !== null);

  const closeMenu = (): void => {
    setMenuOpen(false);
    shellButton.current?.focus();
  };
  const pick = (next: Shell): void => {
    setShell(next);
    saveShell(next);
    closeMenu();
  };
  const copy = (): void => {
    const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
    if (!clipboard) {
      setStatus("manual");
      return;
    }
    clipboard.writeText(lines.join("\n")).then(
      () => {
        setStatus("copied");
      },
      () => {
        setStatus("manual");
      },
    );
  };
  const onMenuKey = (event: KeyboardEvent): void => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      // One thing per press: the menu closes, the sheet stays.
      event.stopPropagation();
      event.preventDefault();
      closeMenu();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? items[0] : items.at(-1))?.focus();
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    }
  };

  return (
    <div className="d2-copy">
      <div className="d2-copy-bar">
        <span className="eyebrow">{argvs.length > 1 ? DETAIL_WORDS.moveInOrder : DETAIL_WORDS.move}</span>
        {printable && (
          <button type="button" className="d2-btn d2-copy-btn" onClick={copy}>
            {LABELS[status]}
          </button>
        )}
        <button
          type="button"
          ref={shellButton}
          className="d2-btn d2-shell-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={DETAIL_WORDS.shellFor.replace("{shell}", SHELL_NAMES[shell])}
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
        >
          {SHELL_NAMES[shell]}
        </button>
        <span className="vh" aria-live="polite">
          {status === "copied" ? DETAIL_WORDS.copied : ""}
        </span>
      </div>
      <div
        ref={menu}
        id={menuId}
        className="d2-shell-menu"
        role="menu"
        aria-label={DETAIL_WORDS.shell}
        hidden={!menuOpen}
        onKeyDown={onMenuKey}
      >
        {SHELLS.map((option) => (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={option === shell}
            tabIndex={-1}
            className="d2-shell-opt"
            onClick={() => {
              pick(option);
            }}
          >
            {SHELL_NAMES[option]}
            <small>{linesFor(argvs.slice(0, 1), option)[0] ?? REFUSED_COMMAND}</small>
          </button>
        ))}
      </div>
      <pre className="d2-copy-cmd">
        {lines.map((line, i) => (
          <span key={i} className={line === null ? "d2-copy-line is-refused" : "d2-copy-line"}>
            {line ?? REFUSED_COMMAND}
          </span>
        ))}
      </pre>
    </div>
  );
}
