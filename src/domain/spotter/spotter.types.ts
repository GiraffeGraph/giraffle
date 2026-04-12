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
  createdAt: Date;
}

export interface SpotterSessionWithMessages extends SpotterSessionSummary {
  messages: SpotterStoredMessage[];
}
