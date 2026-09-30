/** A CLI flag, its leading dashes spaced apart: in a small monospace two hyphens touch and read as
 *  one long dash. */
export function Flag({ text }: { text: string }) {
  const dashes = /^-+/.exec(text)?.[0] ?? "";
  return (
    <span className="mono gate-flag">
      {dashes !== "" && <span className="gate-dashes">{dashes}</span>}
      {text.slice(dashes.length)}
    </span>
  );
}
