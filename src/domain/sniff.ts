/** Which documentation page a run note points at, guessed from its prose: it stops working the day
 *  lockrot rephrases the note. */
export function noteDocLink(note: string): string {
  return /token|activity|repository/.test(note)
    ? "https://lockrot.dev/internals/"
    : "https://lockrot.dev/configuration/";
}
