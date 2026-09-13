import { useStore, useViewport } from "@xyflow/react";
import { documentAt, formatTick, niceStep, ticks } from "../flow/ruler";

/** Ruler thickness, and the size of the square where the two meet. */
export const RULER_SIZE = 22;

/**
 * Optional rulers along the top and left of the canvas, reading in document coordinates.
 *
 * They follow the viewport rather than the screen: pan and the numbers slide with the diagram,
 * zoom and the tick spacing re-chooses itself so labels stay legible instead of piling up. The
 * pointer, when there is one, is marked on both — which is the point of having them at all.
 */
export function Rulers({ pointer }: { pointer: { x: number; y: number } | null }) {
  const { x, y, zoom } = useViewport();
  // React Flow's own measurement of the pane, so the rulers span exactly the drawing area.
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const step = niceStep(zoom);
  const across = ticks(x, width, zoom, step);
  const down = ticks(y, height, zoom, step);

  return (
    <div className="arq-rulers" data-testid="rulers" aria-hidden="true">
      <svg className="arq-ruler arq-ruler-x" width={width} height={RULER_SIZE}>
        {across.map((t) => (
          <g key={t.value}>
            <line x1={t.pos} y1={RULER_SIZE - 6} x2={t.pos} y2={RULER_SIZE} />
            <text x={t.pos + 3} y={RULER_SIZE - 8}>{formatTick(t.value, step)}</text>
          </g>
        ))}
        {pointer !== null ? <line className="arq-ruler-cursor" x1={pointer.x} y1={0} x2={pointer.x} y2={RULER_SIZE} /> : null}
      </svg>

      <svg className="arq-ruler arq-ruler-y" width={RULER_SIZE} height={height}>
        {down.map((t) => (
          <g key={t.value}>
            <line x1={RULER_SIZE - 6} y1={t.pos} x2={RULER_SIZE} y2={t.pos} />
            {/* Rotated about its own anchor so the numbers read up the side, as on a drawing board. */}
            <text x={RULER_SIZE - 8} y={t.pos + 3} transform={`rotate(-90 ${RULER_SIZE - 8} ${t.pos + 3})`}>
              {formatTick(t.value, step)}
            </text>
          </g>
        ))}
        {pointer !== null ? <line className="arq-ruler-cursor" x1={0} y1={pointer.y} x2={RULER_SIZE} y2={pointer.y} /> : null}
      </svg>

      {/* The corner doubles as the readout: where the pointer is, in the same units the ticks show. */}
      <div className="arq-ruler-corner" data-testid="ruler-readout">
        {pointer !== null
          ? `${Math.round(documentAt(pointer.x, x, zoom))}, ${Math.round(documentAt(pointer.y, y, zoom))}`
          : ""}
      </div>
    </div>
  );
}
