import type { IconPack } from "../platform";
import type { IconResolver } from "../flow/to-flow";
import { BUILTIN_ICONS, BUILTIN_PACK } from "./primitives";

/** Installed packs first, in install order; then builtin pack; then the node type's primitive. */
export function createIconResolver(packs: IconPack[]): IconResolver {
  const all = [...packs, BUILTIN_PACK];
  return (id, nodeType) => {
    if (id !== undefined) {
      for (const p of all) {
        const s = p.svgs[id];
        if (s !== undefined) return s;
      }
      return undefined; // referenced but not installed: caller renders a placeholder
    }
    return BUILTIN_ICONS[nodeType];
  };
}
