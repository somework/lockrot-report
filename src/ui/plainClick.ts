/** A primary-button click with no modifier key: the page applies it in place. Any other click is
 *  the browser's, so a reader can open a link in a new tab or copy its address. */
export const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
