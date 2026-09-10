import type { IconPack } from "../platform";
import type { IconResolver } from "../flow/to-flow";
import { BUILTIN_PACK } from "./primitives";

/**
 * Installed packs first, in install order; then the builtin pack. There is no per-node-type
 * fallback in v2: a node without an `icon` has no icon, and the shape alone is its visual.
 */
export function createIconResolver(packs: IconPack[]): IconResolver {
  const all = [...packs, BUILTIN_PACK];
  return (id) => {
    if (id === undefined) return undefined;
    for (const p of all) {
      const s = p.svgs[id];
      if (s !== undefined) return s;
    }
    return undefined; // referenced but not installed: the caller renders a placeholder
  };
}
