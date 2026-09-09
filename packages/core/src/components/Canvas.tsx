import { Background, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export function Canvas() {
  return (
    <ReactFlowProvider>
      <div className="arq-canvas" data-testid="canvas">
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
