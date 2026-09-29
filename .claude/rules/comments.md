# Comments

- Default to no comment. Names, types and tests carry the meaning.
- A comment says only what the code cannot: a non-obvious reason, a constraint from outside (lockrot's schema, a browser quirk, CSP), a trap a reader would fall into.
- Never narrate the next lines, restate a type, or retell history ("was X, now Y", "M24 fixed …"). History belongs in git and CHANGELOG, design decisions in DESIGN.md.
- One or two lines. A longer comment means the code wants a better name or a smaller function.
- Do not pin line numbers, counts or fixture values in comments; they rot.
- When you touch code, delete comments that break these rules instead of editing around them.
