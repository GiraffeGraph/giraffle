export interface SpotterSessionSummary {
  id: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface SpotterStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: unknown | null;
  createdAt: Date;
}

export interface SpotterSessionWithMessages extends SpotterSessionSummary {
  messages: SpotterStoredMessage[];
}
