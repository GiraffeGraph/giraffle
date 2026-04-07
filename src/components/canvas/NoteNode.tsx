import { Handle, Position } from '@xyflow/react';

export function NoteNode({ data, isConnectable }: any) {
  return (
    <div className="graffle-canvas-node-note">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="graffle-handle" />
      <div className="graffle-node-inner" onClick={() => { if(data.onOpen) data.onOpen(data.note?.id) }}>
        <div className="graffle-node-header">
          <span className="graffle-node-icon">{data.note?.icon || "📄"}</span>
          <span className="graffle-node-title">{data.note?.title || "İsimsiz Not"}</span>
        </div>
        <div className="graffle-node-body">
          {data.snippet || "İçeriği görmek için tıklayın..."}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="graffle-handle" />
    </div>
  );
}
