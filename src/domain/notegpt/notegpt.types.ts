export interface NoteGptSessionSummary {
  id: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface NoteGptStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface NoteGptSessionWithMessages extends NoteGptSessionSummary {
  messages: NoteGptStoredMessage[];
}
