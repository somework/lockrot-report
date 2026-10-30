/** Brings `target` to the top of the open package's scroller, below its sticky head, and moves no
 *  other scroller: at wide widths the list beside the sheet stays where the reader left it. */
export function jumpInDetail(target: HTMLElement): void {
  const scroller = target.closest<HTMLElement>(".shell-detail");
  if (scroller === null) {
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start" });
    return;
  }
  const padding = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
  const top =
    target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - padding;
  scroller.scrollTo({ top });
}
