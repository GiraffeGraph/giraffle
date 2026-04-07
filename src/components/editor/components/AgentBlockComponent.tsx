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
      // Simulate subsession context reading and streaming.
      // In REAL usage, this would call out to a Context/Provider handling the LSP lifecycle
      setTimeout(() => {
        updateAttributes({ status: "streaming" });
        const simulateStream = "Cevap üretiliyor...\nBu yapısal olarak mevcut AST'nin sadece Tiptap değil global state farkındalığıyla çalıştığını gösterir.";
        let currentOut = "";
        
        let i = 0;
        const interval = setInterval(() => {
          if (i >= simulateStream.length) {
            clearInterval(interval);
            updateAttributes({ status: "done" });
            return;
          }
          currentOut += simulateStream[i];
          updateAttributes({ output: currentOut });
          i++;
        }, 30);
      }, 500);

    } catch (e) {
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
