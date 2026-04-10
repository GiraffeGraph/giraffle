import type { Node } from "@xyflow/react";
import type { LibraryWorkspaceSeed } from "@/components/library/library.data";
import type { NoteGptWorkspaceProps } from "@/components/notegpt/notegpt.types";
import type {
  SidebarFolder,
  SidebarNote,
  SidebarTag,
  SidebarTemplate,
} from "@/components/sidebar/sidebar.types";
import type { SettingsWorkspaceProps } from "@/components/settings/SettingsWorkspace";
import type { GraphProjection, UnresolvedLink } from "@/domain/link/link.types";
import type { NoteExportArtifact } from "@/domain/note/note.export";
import type { UniverseCameraState } from "@/lib/universe-regions";

export interface UniversePaletteData {
  notes: SidebarNote[];
  folders: SidebarFolder[];
  tags: SidebarTag[];
  templates: SidebarTemplate[];
}

export interface UniverseSearchSeed {
  notes: SidebarNote[];
  folders: SidebarFolder[];
  templates: SidebarTemplate[];
  unresolvedLinks: UnresolvedLink[];
}

export interface UniverseInboxSeed {
  notes: SidebarNote[];
}

export interface UniverseGraphSeed {
  graph: GraphProjection;
  unresolvedLinks: UnresolvedLink[];
}

export interface UniversePublishSeed {
  artifacts: NoteExportArtifact[];
}

export interface UniverseProposalSummary {
  id: string;
  noteId: string;
  title: string;
  status: string;
  summary: string | null;
  noteTitle: string;
}

export interface UniverseShellProps {
  initialCamera: UniverseCameraState;
  palette: UniversePaletteData;
  inboxSeed: UniverseInboxSeed;
  searchSeed: UniverseSearchSeed;
  librarySeed: LibraryWorkspaceSeed;
  graphSeed: UniverseGraphSeed;
  publishSeed: UniversePublishSeed;
  proposals: UniverseProposalSummary[];
  noteGptSeed: Pick<NoteGptWorkspaceProps, "notes" | "folders">;
  settingsLogs: SettingsWorkspaceProps["operationLogs"];
}

export interface UniverseRegionFrameNodeData extends Record<string, unknown> {
  label: string;
  caption: string;
}

export interface UniversePortalNodeData extends Record<string, unknown> {
  eyebrow: string;
  title: string;
  description: string;
  route: string;
  icon: string;
  chips?: string[];
}

export interface UniverseSettingsNodeData extends Record<string, unknown> {
  operationLogs: SettingsWorkspaceProps["operationLogs"];
}

export interface UniverseNoteGptNodeData extends Record<string, unknown> {
  notes: NoteGptWorkspaceProps["notes"];
  folders: NoteGptWorkspaceProps["folders"];
}

export interface UniverseNoteNodeData extends Record<string, unknown> {
  noteId: string;
  title: string;
  icon: string | null;
  snippet: string;
}

export type UniverseModuleId =
  | "inbox"
  | "search"
  | "library"
  | "graph"
  | "publish"
  | "proposals"
  | "notegpt"
  | "settings";

interface UniverseModuleBaseData extends Record<string, unknown> {
  moduleId: UniverseModuleId;
  title: string;
  icon: string;
}

export interface UniverseInboxModuleData extends UniverseModuleBaseData {
  moduleId: "inbox";
  seed: UniverseInboxSeed;
}

export interface UniverseSearchModuleData extends UniverseModuleBaseData {
  moduleId: "search";
  seed: UniverseSearchSeed;
}

export interface UniverseLibraryModuleData extends UniverseModuleBaseData {
  moduleId: "library";
  seed: LibraryWorkspaceSeed;
}

export interface UniverseGraphModuleData extends UniverseModuleBaseData {
  moduleId: "graph";
  seed: UniverseGraphSeed;
}

export interface UniversePublishModuleData extends UniverseModuleBaseData {
  moduleId: "publish";
  seed: UniversePublishSeed;
}

export interface UniverseProposalsModuleData extends UniverseModuleBaseData {
  moduleId: "proposals";
  seed: UniverseProposalSummary[];
}

export interface UniverseNoteGptModuleData extends UniverseModuleBaseData {
  moduleId: "notegpt";
  seed: Pick<NoteGptWorkspaceProps, "notes" | "folders">;
}

export interface UniverseSettingsModuleData extends UniverseModuleBaseData {
  moduleId: "settings";
  seed: SettingsWorkspaceProps["operationLogs"];
}

export type UniverseModuleNodeData =
  | UniverseInboxModuleData
  | UniverseSearchModuleData
  | UniverseLibraryModuleData
  | UniverseGraphModuleData
  | UniversePublishModuleData
  | UniverseProposalsModuleData
  | UniverseNoteGptModuleData
  | UniverseSettingsModuleData;

export type UniverseRegionFrameNode = Node<
  UniverseRegionFrameNodeData,
  "regionFrame"
>;
export type UniversePortalNode = Node<UniversePortalNodeData, "portal">;
export type UniverseSettingsNode = Node<UniverseSettingsNodeData, "settings">;
export type UniverseNoteGptNode = Node<UniverseNoteGptNodeData, "notegpt">;
export type UniverseNoteNode = Node<UniverseNoteNodeData, "universeNote">;
export type UniverseModuleNode = Node<UniverseModuleNodeData, "module">;
