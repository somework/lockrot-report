/** A package name that moves to the next line whole, breaks after its vendor's slash only when it
 *  is wider than a line, and never at a hyphen. */
export function PackageWord({ name, className = "f2-name" }: { name: string; className?: string }) {
  const slash = name.indexOf("/");
  if (slash < 0) return <span className={`${className} f2-unit`}>{name}</span>;
  return (
    <span className={`${className} pkg-word`}>
      <span className="f2-unit">{name.slice(0, slash + 1)}</span>
      <wbr />
      <span className="f2-unit">{name.slice(slash + 1)}</span>
    </span>
  );
}

/** The characters a version shows before it is cut. */
const VERSION_SHOWN = 18;

/** A version on one line. A long one (a `dev-` branch) is cut, and its title and the sheet hold it
 *  whole; a short one stays plain inline text, on the line's baseline. */
export function Version({ version, className }: { version: string; className: string }) {
  if (version.length <= VERSION_SHOWN) return <span className={className}>{version}</span>;
  return (
    <span className={`${className} is-clipped`} title={version}>
      {version}
    </span>
  );
}
