export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

const VIEWPORT_MARGIN = 8;

export function computePosition(anchor: HTMLElement, content: HTMLElement, placement: Placement, gutter = 8) {
  const a = anchor.getBoundingClientRect();
  const c = content.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const wantsBottom = placement.startsWith("bottom");
  let top = wantsBottom ? a.bottom + gutter : a.top - c.height - gutter;

  // Flip vertically if there isn't room in the preferred direction.
  if (wantsBottom && top + c.height > vh - VIEWPORT_MARGIN) {
    top = a.top - c.height - gutter;
  } else if (!wantsBottom && top < VIEWPORT_MARGIN) {
    top = a.bottom + gutter;
  }

  let left = placement.endsWith("start") ? a.left : a.right - c.width;
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), vw - c.width - VIEWPORT_MARGIN);
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), vh - c.height - VIEWPORT_MARGIN);

  return { top, left };
}
