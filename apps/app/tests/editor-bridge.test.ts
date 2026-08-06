import { editorMessageSchema, parseEditorMessage } from "@/components/editor/bridge";

const BLOCK_ID = "8ec6a3b2-2f52-4d0b-9f6a-9c1a5c3e7b41";

describe("editor WebView bridge", () => {
  test("accepts every versioned message the editor is allowed to send", () => {
    const messages = [
      { type: "ready", bridgeVersion: 1 },
      {
        type: "document-change",
        bridgeVersion: 1,
        document: { type: "doc", content: [{ type: "paragraph", attrs: { id: "stable" } }] },
      },
      { type: "task-toggle", bridgeVersion: 1, blockId: BLOCK_ID, checked: true },
      { type: "open-link", bridgeVersion: 1, target: "Field Notes" },
      { type: "attachment-request", bridgeVersion: 1, accept: ["image/png"] },
      { type: "focus-change", bridgeVersion: 1, focused: false },
      { type: "bridge-error", bridgeVersion: 1, message: "editor crashed" },
    ];

    expect(messages.map((message) => editorMessageSchema.parse(message).type)).toEqual([
      "ready",
      "document-change",
      "task-toggle",
      "open-link",
      "attachment-request",
      "focus-change",
      "bridge-error",
    ]);
  });

  test("rejects a message type the native side has no handler for", () => {
    expect(() =>
      editorMessageSchema.parse({ type: "execute", bridgeVersion: 1, command: "rm" }),
    ).toThrow();
  });

  test("rejects extra keys smuggled onto a known message", () => {
    expect(() =>
      editorMessageSchema.parse({
        type: "open-link",
        bridgeVersion: 1,
        target: "Map",
        eval: "globalThis.fetch",
      }),
    ).toThrow();
  });

  test("pins the bridge version so an older editor bundle cannot talk to a newer host", () => {
    expect(() => editorMessageSchema.parse({ type: "ready", bridgeVersion: 2 })).toThrow();
    expect(() => editorMessageSchema.parse({ type: "ready" })).toThrow();
  });

  test("task toggles must name a real block id", () => {
    expect(() =>
      editorMessageSchema.parse({
        type: "task-toggle",
        bridgeVersion: 1,
        blockId: "not-a-uuid",
        checked: true,
      }),
    ).toThrow();
  });

  test("bounds every free-form field the WebView controls", () => {
    expect(() =>
      editorMessageSchema.parse({ type: "open-link", bridgeVersion: 1, target: "x".repeat(513) }),
    ).toThrow();
    expect(() =>
      editorMessageSchema.parse({ type: "open-link", bridgeVersion: 1, target: "" }),
    ).toThrow();
    expect(() =>
      editorMessageSchema.parse({
        type: "attachment-request",
        bridgeVersion: 1,
        accept: Array.from({ length: 33 }, () => "image/png"),
      }),
    ).toThrow();
  });

  test("parses documents nested several blocks deep", () => {
    const message = parseEditorMessage(
      JSON.stringify({
        type: "document-change",
        bridgeVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Pack water", marks: [{ type: "bold" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );

    expect(message.type).toBe("document-change");
  });

  test("a WebView that posts garbage throws instead of reaching the repository", () => {
    expect(() => parseEditorMessage("not json")).toThrow();
    expect(() => parseEditorMessage(JSON.stringify({ type: "ready" }))).toThrow();
  });
});
