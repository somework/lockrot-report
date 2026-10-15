import type { ComponentChildren } from "preact";
import "../styles/tokens.css";
import "../styles/base.css";
import "./app.css";
import "./screen.css";

interface ScreenFrameProps {
  /** The band under the brand row, in the newer-schema banner's style. */
  banner?: ComponentChildren;
  headingId: string;
  children: ComponentChildren;
}

/** A page shown in place of the report: the brand row, an optional band, then one column
 *  (PD-SCHEMA-1). */
export function ScreenFrame({ banner, headingId, children }: ScreenFrameProps) {
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="dot" aria-hidden="true" />
            <p className="screen-brand">
              <a href="https://lockrot.dev/" target="_blank" rel="noopener noreferrer">
                lockrot
              </a>
            </p>
          </div>
        </div>
      </header>
      {banner !== undefined && (
        <div className="schema-banner">
          <p>{banner}</p>
        </div>
      )}
      <main className="screen-main" aria-labelledby={headingId}>
        {children}
      </main>
    </div>
  );
}
