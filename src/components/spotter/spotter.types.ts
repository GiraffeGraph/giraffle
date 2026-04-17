export interface SpotterWorkspaceProps {
  notes: Array<{
    id: string;
    title: string;
    icon: string | null;
    folderId: string | null;
    updatedAtLabel: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    icon: string | null;
    parentId: string | null;
  }>;
  embedded?: boolean;
  initialSessionId?: string | null;
  initialMessages?: ChatMessage[];
  initialPrompt?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
