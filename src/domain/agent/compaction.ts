import type { ModelMessage } from "ai";

export interface CompactionOptions {
  /**
   * Trigger compaction once total message count exceeds this threshold.
   */
  triggerCount: number;
  /**
   * Number of most recent messages to keep verbatim.
   */
  keepTail: number;
  /**
   * Per tool-result content size limit (in characters of JSON).
   */
  perResultCharLimit: number;
}

export const DEFAULT_COMPACTION: CompactionOptions = {
  triggerCount: 30,
  keepTail: 20,
  perResultCharLimit: 1_200,
};

interface ToolContentBlock {
  type: string;
  toolCallId?: string;
  toolName?: string;
  output?: unknown;
  result?: unknown;
}

function summariseToolContent(blocks: ToolContentBlock[], charLimit: number): ToolContentBlock[] {
  return blocks.map((block) => {
    if (block.type !== "tool-result") return block;
    const sourceJson = JSON.stringify(block.output ?? block.result ?? null);
    if (sourceJson.length <= charLimit) return block;
    const preview = sourceJson.slice(0, charLimit);
    return {
      ...block,
      output: {
        type: "text",
        value: `[truncated to ${charLimit} chars] ${preview}…`,
      },
    };
  });
}

/**
 * Compact a model-messages array by:
 * 1. Keeping system+head + last `keepTail` messages untouched.
 * 2. For tool messages in the middle, replacing oversized tool-result blocks
 *    with a short text preview (preserving toolCallId pairing).
 * 3. Leaving user/assistant messages alone — only tool results are compacted,
 *    since they're typically the largest payloads.
 */
export function compactMessages(
  messages: ModelMessage[],
  options: CompactionOptions = DEFAULT_COMPACTION,
): { messages: ModelMessage[]; compacted: boolean; before: number; after: number } {
  if (messages.length <= options.triggerCount) {
    return { messages, compacted: false, before: messages.length, after: messages.length };
  }
  const head = messages.slice(0, 1);
  const tail = messages.slice(-options.keepTail);
  const middle = messages.slice(1, -options.keepTail);
  const compactedMiddle = middle.map((msg) => {
    if (msg.role !== "tool") return msg;
    if (!Array.isArray(msg.content)) return msg;
    const blocks = msg.content as ToolContentBlock[];
    return {
      ...msg,
      content: summariseToolContent(blocks, options.perResultCharLimit),
    } as ModelMessage;
  });
  const next = [...head, ...compactedMiddle, ...tail];
  return { messages: next, compacted: true, before: messages.length, after: next.length };
}
