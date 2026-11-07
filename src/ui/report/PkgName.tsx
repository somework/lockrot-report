import { Fragment } from "preact";

/** A line-break opportunity. A `<wbr>` puts a space into the accessible name in Chromium; this
 *  draws a zero-width space with empty alt text instead (base.css). */
export const Wbr = () => <span className="wbr" />;

/** Text that may break only after a "/", ":" or "=", never at a hyphen: each part stays whole. */
export function Breakable({ text, className = "nb" }: { text: string; className?: string }) {
  const parts = text.split(/(?<=[/:=])/);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <Wbr />}
          <span className={className}>{part}</span>
        </Fragment>
      ))}
    </>
  );
}

/** A package name that breaks only after its "/". */
export const PkgName = ({ name }: { name: string }) => <Breakable text={name} />;

/** Text that wraps only at its spaces: each word stays whole, a hyphen inside it included. */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="nb">{word}</span>
        </Fragment>
      ))}
    </>
  );
}
