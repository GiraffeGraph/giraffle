import type { Node } from "@xyflow/react";
import type { LibraryWorkspaceSeed } from "@/components/library/library.data";
import type { SpotterWorkspaceProps } from "@/components/spotter/spotter.types";
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

export interface UniverseSuggestionSummary {
  id: string;
  href: string;
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
  suggestions: UniverseSuggestionSummary[];
  spotterSeed: Pick<SpotterWorkspaceProps, "notes" | "folders">;
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

export interface UniverseSpotterNodeData extends Record<string, unknown> {
  notes: SpotterWorkspaceProps["notes"];
  folders: SpotterWorkspaceProps["folders"];
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
  | "suggestions"
  | "spotter"
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

export interface UniverseSuggestionsModuleData extends UniverseModuleBaseData {
  moduleId: "suggestions";
  seed: UniverseSuggestionSummary[];
}

export interface UniverseSpotterModuleData extends UniverseModuleBaseData {
  moduleId: "spotter";
  seed: Pick<SpotterWorkspaceProps, "notes" | "folders">;
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
  | UniverseSuggestionsModuleData
  | UniverseSpotterModuleData
  | UniverseSettingsModuleData;

export type UniverseRegionFrameNode = Node<
  UniverseRegionFrameNodeData,
  "regionFrame"
>;
export type UniversePortalNode = Node<UniversePortalNodeData, "portal">;
export type UniverseSettingsNode = Node<UniverseSettingsNodeData, "settings">;
export type UniverseSpotterNode = Node<UniverseSpotterNodeData, "spotter">;
export type UniverseNoteNode = Node<UniverseNoteNodeData, "universeNote">;
export type UniverseModuleNode = Node<UniverseModuleNodeData, "module">;
