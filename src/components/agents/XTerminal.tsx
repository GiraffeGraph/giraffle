"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface XTerminalProps {
  agentId: string;
  wsBaseUrl?: string;
  className?: string;
  onStatusChange?: (status: "connecting" | "connected" | "closed" | "error") => void;
}

export function XTerminal({ agentId, wsBaseUrl, className, onStatusChange }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "closed" | "error">("connecting");

  const updateStatus = useCallback(
    (s: typeof status) => {
      setStatus(s);
      onStatusChange?.(s);
    },
    [onStatusChange],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    async function init() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        theme: {
          background: "#111214",
          foreground: "#e8e8e6",
          cursor: "#e1a63e",
          cursorAccent: "#111214",
          selectionBackground: "rgba(225, 166, 62, 0.25)",
          black: "#1a1a1a",
          red: "#ef5350",
          green: "#66bb6a",
          yellow: "#e1a63e",
          blue: "#5c8cff",
          magenta: "#ab47bc",
          cyan: "#26c6da",
          white: "#ebebea",
          brightBlack: "#545454",
          brightRed: "#ef9a9a",
          brightGreen: "#a5d6a7",
          brightYellow: "#ffe082",
          brightBlue: "#90caf9",
          brightMagenta: "#ce93d8",
          brightCyan: "#80deea",
          brightWhite: "#f5f5f5",
        },
      });

      const fitAddon = new FitAddon();
      const webLinks = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinks);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Determine WebSocket URL
      const base =
        wsBaseUrl ??
        (typeof window !== "undefined"
          ? `ws://${window.location.hostname}:${process.env.NEXT_PUBLIC_WS_PORT ?? "3001"}`
          : "ws://localhost:3001");

      const ws = new WebSocket(`${base}/ws/terminal/${agentId}`);
      wsRef.current = ws;
      updateStatus("connecting");

      ws.onopen = () => {
        // Initial resize
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      };

      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data as string) as {
            type: string;
            status?: string;
            message?: string;
          };
          if (msg.type === "status") {
            if (msg.status === "connected") {
              updateStatus("connected");
              term.writeln("\r\x1b[32m◆ Terminal connected\x1b[0m");
            } else if (msg.status === "error") {
              updateStatus("error");
              term.writeln(`\r\x1b[31m✖ ${msg.message ?? "Connection error"}\x1b[0m`);
            } else if (msg.status === "closed") {
              updateStatus("closed");
              term.writeln("\r\x1b[33m● Session closed\x1b[0m");
            }
          }
        } catch {
          // Raw terminal data — write directly
          term.write(data as string);
        }
      };

      ws.onclose = () => updateStatus("closed");
      ws.onerror = () => updateStatus("error");

      // Browser → SSH
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Resize observer
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      });
      if (containerRef.current) resizeObserver.observe(containerRef.current);

      // Cleanup
      return () => {
        resizeObserver.disconnect();
      };
    }

    const cleanup = init();

    return () => {
      disposed = true;
      cleanup.then((fn) => fn?.());
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [agentId, wsBaseUrl, updateStatus]);

  return (
    <div className={`xterm-shell ${className ?? ""}`} style={{ position: "relative" }}>
      {status === "connecting" && (
        <div className="xterm-overlay">
          <span className="material-symbols-outlined xterm-spinner">sync</span>
          Connecting…
        </div>
      )}
      {status === "error" && (
        <div className="xterm-overlay xterm-overlay-error">
          <span className="material-symbols-outlined">error</span>
          SSH bağlantısı kurulamadı
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", minHeight: 320 }}
      />
    </div>
  );
}
