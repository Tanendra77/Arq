import { useCallback, type DragEvent } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEditor } from "../store/context";
import { DRAG_MIME, decodeDragPayload } from "../flow/drag-payload";

function CanvasInner() {
  const addNode = useEditor((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const payload = decodeDragPayload(e.dataTransfer.getData(DRAG_MIME));
      if (!payload) return;
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode({
        type: payload.nodeType,
        label: payload.label,
        position,
        ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
      });
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div className="arq-canvas" data-testid="canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow nodes={[]} edges={[]} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
