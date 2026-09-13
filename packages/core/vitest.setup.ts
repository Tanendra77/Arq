import "@testing-library/jest-dom/vitest";

/**
 * jsdom has no layout engine and never fires a resize, but React Flow measures nodes only from
 * its ResizeObserver callback and renders no edge for an unmeasured node. The shim reports once
 * as soon as an element is observed, which is what a real ResizeObserver does on the first frame;
 * the sizes come from the offset getters below, which stand in for the missing layout.
 */
class RO {
  #cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.#cb = cb;
  }
  observe(target: Element): void {
    // React Flow's callbacks only read `entry.target` and `entry.contentRect`.
    const el = target as HTMLElement;
    const entry = { target, contentRect: { width: el.offsetWidth, height: el.offsetHeight } };
    this.#cb([entry as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly ??= class {
  m22 = 1;
  constructor(_t?: string) {}
};

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { get: () => 600, configurable: true },
  offsetWidth: { get: () => 800, configurable: true },
});
