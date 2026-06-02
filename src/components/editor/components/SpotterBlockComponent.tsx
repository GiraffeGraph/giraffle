import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import React from "react";
import { drainNdjson, type AgentEvent } from "@/lib/agent-stream";

export function SpotterBlockComponent(props: NodeViewProps) {
  const { node, updateAttributes, editor, deleteNode } = props;
  const { status, prompt, output } = node.attrs;

  const handlePromptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateAttributes({ prompt: event.target.value });
  };

  const handleRun = async () => {
    if (!prompt.trim()) {
      return;
    }

    updateAttributes({ status: "thinking", output: "" });

    try {
      // Cap the note context so prompt + context stays under the route's 20k
      // limit (otherwise the request 400s and the block just shows "error").
      const context = editor.getText().slice(0, 16_000);

      const response = await fetch("/api/spotter/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}\n\n--- Current note context ---\n${context}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Spotter request failed");
      }

      updateAttributes({ status: "streaming" });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let currentOutput = "";
      let buffer = "";

      const applyEvents = (events: AgentEvent[]) => {
        for (const ev of events) {
          if (ev.kind === "text") {
            currentOutput += ev.text;
            updateAttributes({ output: currentOutput });
          } else if (ev.kind === "done" && !currentOutput && ev.result) {
            currentOutput = ev.result;
            updateAttributes({ output: currentOutput });
          } else if (ev.kind === "error") {
            throw new Error(ev.message);
          }
        }
      };

      if (reader) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = drainNdjson(buffer);
            buffer = rest;
            applyEvents(events);
          }
          // Flush any final line that arrived without a trailing newline.
          applyEvents(drainNdjson(buffer + decoder.decode()).events);
        } finally {
          // Release the reader / abort the body on any exit path (incl. throw).
          await reader.cancel().catch(() => {});
        }
      }

      updateAttributes({ status: "done" });
    } catch (error) {
      console.error("Spotter stream error", error);
      updateAttributes({ status: "error" });
    }
  };

  const handleApply = () => {
    if (!output) {
      return;
    }

    const { tr } = editor.state;
    const position = props.getPos();

    if (typeof position !== "number") {
      return;
    }

    tr.replaceWith(position, position + node.nodeSize, editor.schema.text(output));
    editor.view.dispatch(tr);
  };

  return (
    <NodeViewWrapper className="giraffle-spotter-block" data-drag-handle>
      <div className="GiraffleSpotterBlock_Inner">
        <div className="GiraffleSpotterBlock_Header">
          <span className="GiraffleSpotter_Icon">✨</span>
          <span className="GiraffleSpotter_Title">Spotter</span>
        </div>

        <div className="GiraffleSpotterBlock_Body">
          {status === "idle" ? (
            <div className="GiraffleSpotter_InputRow">
              <input
                type="text"
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Write a prompt for Spotter..."
                className="GiraffleSpotter_Input"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleRun();
                  }
                }}
              />
              <button
                onClick={() => void handleRun()}
                className="GiraffleSpotter_BtnRun"
                disabled={!prompt.trim()}
              >
                Run
              </button>
            </div>
          ) : null}

          {status === "thinking" ? (
            <div className="GiraffleSpotter_StatusRow">
              <span className="GiraffleSpotter_Spinner animate-spin inline-block">⏳</span>
              Spotter is thinking...
            </div>
          ) : null}

          {status === "streaming" || status === "done" ? (
            <div className="GiraffleSpotter_OutputRow">
              <div className="GiraffleSpotter_OutputContent whitespace-pre-wrap">{output}</div>
              {status === "streaming" ? <span className="GiraffleSpotter_Cursor" /> : null}
            </div>
          ) : null}

          {status === "done" ? (
            <div className="GiraffleSpotter_ActionsRow">
              <button onClick={handleApply} className="GiraffleSpotter_BtnAction">
                Apply
              </button>
              <button
                onClick={deleteNode}
                className="GiraffleSpotter_BtnAction ghost"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
