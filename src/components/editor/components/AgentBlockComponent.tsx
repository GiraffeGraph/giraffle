import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import React from "react";

export function AgentBlockComponent(props: NodeViewProps) {
  const { node, updateAttributes, editor, deleteNode } = props;
  const { status, prompt, output } = node.attrs;

  const handlePromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAttributes({ prompt: e.target.value });
  };

  const handleRun = async () => {
    if (!prompt.trim()) return;
    
    updateAttributes({ status: "thinking", output: "" });

    try {
      // Pass the entire flattened text content of the document as context boundary for Phase 1
      const context = editor.getText();
      
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context }),
      });

      if (!res.ok) {
        throw new Error("LSP request failed");
      }

      updateAttributes({ status: "streaming" });
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let currentOut = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          currentOut += decoder.decode(value, { stream: true });
          updateAttributes({ output: currentOut });
        }
      }

      updateAttributes({ status: "done" });
    } catch (e) {
      console.error("Agent Stream Error:", e);
      updateAttributes({ status: "error" });
    }
  };

  const handleApply = () => {
    if (!output) return;
    const { tr } = editor.state;
    // Replace the block with the output text as paragraphs
    const pos = props.getPos();
    if (typeof pos !== "number") return;

    tr.replaceWith(pos, pos + node.nodeSize, editor.schema.text(output));
    editor.view.dispatch(tr);
  };

  const handleDismiss = () => {
    deleteNode();
  };

  return (
    <NodeViewWrapper className="graffle-agent-block" data-drag-handle>
      <div className="GraffleAgentBlock_Inner">
        <div className="GraffleAgentBlock_Header">
          <span className="GraffleAgent_Icon">✨</span>
          <span className="GraffleAgent_Title">LSP Ajan Bağlantısı</span>
        </div>
        
        <div className="GraffleAgentBlock_Body">
          {status === "idle" && (
            <div className="GraffleAgent_InputRow">
              <input 
                type="text" 
                value={prompt} 
                onChange={handlePromptChange} 
                placeholder="Ajan için bir istek yaz... (Örn: Bu notun özetini çıkar)" 
                className="GraffleAgent_Input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRun();
                }}
              />
              <button onClick={handleRun} className="GraffleAgent_BtnRun" disabled={!prompt.trim()}>
                Çalıştır
              </button>
            </div>
          )}
          
          {status === "thinking" && (
            <div className="GraffleAgent_StatusRow">
              <span className="GraffleAgent_Spinner animate-spin inline-block">⏳</span> Bağlam analiz ediliyor...
            </div>
          )}
          
          {(status === "streaming" || status === "done") && (
            <div className="GraffleAgent_OutputRow">
               <div className="GraffleAgent_OutputContent whitespace-pre-wrap">{output}</div>
               {status === "streaming" && <span className="GraffleAgent_Cursor"></span>}
            </div>
          )}
          
          {status === "done" && (
            <div className="GraffleAgent_ActionsRow">
              <button onClick={handleApply} className="GraffleAgent_BtnAction">Uygula</button>
              <button onClick={handleDismiss} className="GraffleAgent_BtnAction ghost">Vazgeç</button>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
