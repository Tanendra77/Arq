import "@testing-library/jest-dom/vitest";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly ??= class {
  m22 = 1;
  constructor(_t?: string) {}
};
Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { get: () => 600 },
  offsetWidth: { get: () => 800 },
});
