/**
 * Ids for the hidden nodes that stand in for an edge's loose (unattached) ends.
 *
 * These live in their own module because both the flow layer (which creates them) and the editor
 * store (which must not mistake one for a deleted document node when pruning a selection) need
 * them, and neither should have to import the other to ask.
 *
 * The prefix is reserved by the document schema, which rejects any authored id starting with it.
 */
const PREFIX = "__ep:";

export const endpointNodeId = (edgeId: string, which: "from" | "to") => `${PREFIX}${edgeId}:${which}`;

/** The inverse, or null for an ordinary node id. */
export function parseEndpointNodeId(id: string): { edgeId: string; which: "from" | "to" } | null {
  if (!id.startsWith(PREFIX)) return null;
  const last = id.lastIndexOf(":");
  const which = id.slice(last + 1);
  if (which !== "from" && which !== "to") return null;
  return { edgeId: id.slice(PREFIX.length, last), which };
}
