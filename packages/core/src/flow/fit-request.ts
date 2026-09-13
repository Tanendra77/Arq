/**
 * Ask the canvas to fit its view to the diagram, from outside it — the JSON panel after a tidy, or
 * when a diagram first appears. The canvas owns the viewport, so it is the one that listens.
 */
const listeners = new Set<() => void>();

export function requestFitView(): void {
  listeners.forEach((l) => l());
}

export function onFitViewRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
