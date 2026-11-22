/** Native dialogs make the page inert, but do not lock its scrolling on iOS. */
export function installModalScrollGuard() {
  let restore: (() => void) | undefined;
  let point: { x: number; y: number } | undefined;
  const hasDialog = () => !!document.querySelector("dialog[open]");
  function sync() {
    if (hasDialog() && !restore) {
      const x = window.scrollX, y = window.scrollY;
      const body = document.body, root = document.documentElement;
      const properties: [HTMLElement, string, string][] = [
        [body, "position", "fixed"], [body, "top", `${-y}px`],
        [body, "left", `${-x}px`], [body, "width", "100%"],
        [body, "overflow", "hidden"], [root, "overflow", "hidden"],
        [root, "overscroll-behavior", "none"],
      ];
      const previous = properties.map(([element, name]) => [element, name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)] as const);
      const scrollbar = window.innerWidth - root.clientWidth;
      if (scrollbar > 0) {
        previous.push([body, "padding-right", body.style.getPropertyValue("padding-right"), body.style.getPropertyPriority("padding-right")]);
        body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`;
      }
      properties.forEach(([element, name, value]) => element.style.setProperty(name, value));
      restore = () => {
        previous.forEach(([element, name, value, priority]) => value ? element.style.setProperty(name, value, priority) : element.style.removeProperty(name));
        // Override any page-wide smooth scrolling when restoring the exact position.
        window.scrollTo({ left: x, top: y, behavior: "instant" });
      };
    } else if (!hasDialog() && restore) {
      const unlock = restore; restore = undefined; point = undefined; unlock();
    }
  }
  function canScroll(target: EventTarget | null, dx: number, dy: number) {
    const element = target instanceof Element ? target : null;
    const dialog = element?.closest("dialog[open]");
    if (!dialog) return false;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    for (let node: Element | null = element; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      const overflow = horizontal ? css.overflowX : css.overflowY;
      const position = horizontal ? node.scrollLeft : node.scrollTop;
      const maximum = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
      const delta = horizontal ? dx : dy;
      if (/(auto|scroll)/.test(overflow) && maximum > 1 && ((delta > 0 && position < maximum - 1) || (delta < 0 && position > 1))) return true;
      if (node === dialog) break;
    }
    return false;
  }
  function start(event: TouchEvent) {
    point = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined;
  }
  function move(event: TouchEvent) {
    if (!hasDialog() || !point || event.touches.length !== 1) return;
    const touch = event.touches[0], dx = point.x - touch.clientX, dy = point.y - touch.clientY;
    point = { x: touch.clientX, y: touch.clientY };
    if ((dx || dy) && !canScroll(event.target, dx, dy) && event.cancelable) event.preventDefault();
  }
  function wheel(event: WheelEvent) {
    if (hasDialog() && !event.ctrlKey && !canScroll(event.target, event.deltaX, event.deltaY) && event.cancelable) event.preventDefault();
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  document.addEventListener("touchstart", start, { passive: true, capture: true });
  document.addEventListener("touchmove", move, { passive: false, capture: true });
  document.addEventListener("wheel", wheel, { passive: false, capture: true });
  sync();
  return () => {
    observer.disconnect();
    document.removeEventListener("touchstart", start, true);
    document.removeEventListener("touchmove", move, true);
    document.removeEventListener("wheel", wheel, true);
    restore?.();
  };
}
