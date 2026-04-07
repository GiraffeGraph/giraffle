import { Handle, Position } from '@xyflow/react';

export function NoteNode({ data, isConnectable }: any) {
  return (
    <div className="giraffle-canvas-node-note">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="giraffle-handle" />
      <div className="giraffle-node-inner" onClick={() => { if(data.onOpen) data.onOpen(data.note?.id) }}>
        <div className="giraffle-node-header">
          <span className="giraffle-node-icon">{data.note?.icon || "📄"}</span>
          <span className="giraffle-node-title">{data.note?.title || "İsimsiz Not"}</span>
        </div>
        <div className="giraffle-node-body">
          {data.snippet || "İçeriği görmek için tıklayın..."}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="giraffle-handle" />
    </div>
  );
}
