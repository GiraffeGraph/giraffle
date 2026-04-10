import type { Metadata } from "next";
import { getLibraryWorkspaceSeed } from "@/components/library/library.server";
import { UniverseShell } from "@/components/universe/UniverseShell";
import { buildTemplatePreviewFromBlocks } from "@/domain/template/template.preview";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { getAllFoldersAction } from "@/server/api/folders";
import {
  getGraphProjectionAction,
  getUnresolvedLinksAction,
} from "@/server/api/graph";
import { getPublishedExportsAction, getNotesAction } from "@/server/api/notes";
import { getWorkspaceProposalsAction } from "@/server/api/proposals";
import { getWorkspaceTagsAction } from "@/server/api/tags";
import { getTemplatesAction } from "@/server/api/templates";
import { getUniverseStateAction } from "@/server/api/universe";

export const metadata: Metadata = {
  title: "Universe | Giraffle",
};

export default async function UniversePage() {
  const { userId } = await requireAuthenticatedUser();

  const [
    camera,
    notes,
    folders,
    templates,
    tags,
    publishedExports,
    operationLogs,
    librarySeed,
    graph,
    unresolvedLinks,
    proposals,
  ] = await Promise.all([
    getUniverseStateAction(),
    getNotesAction(),
    getAllFoldersAction(),
    getTemplatesAction(),
    getWorkspaceTagsAction(),
    getPublishedExportsAction(),
    getRecentOperationLogs(userId, 30),
    getLibraryWorkspaceSeed(),
    getGraphProjectionAction(),
    getUnresolvedLinksAction(),
    getWorkspaceProposalsAction(),
  ]);

  const sidebarTemplates = templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    icon: template.icon,
    previewText: buildTemplatePreviewFromBlocks(template.blocks),
    variables: template.variables as Array<{
      name: string;
      label: string;
      type: "text" | "date" | "select";
      defaultValue?: string;
      options?: string[];
    }>,
  }));

  return (
    <UniverseShell
      initialCamera={camera}
      palette={{
        notes,
        folders,
        tags,
        templates: sidebarTemplates,
      }}
      inboxSeed={{
        notes,
      }}
      searchSeed={{
        notes,
        folders,
        templates: sidebarTemplates,
        unresolvedLinks,
      }}
      librarySeed={librarySeed}
      graphSeed={{
        graph,
        unresolvedLinks,
      }}
      publishSeed={{
        artifacts: publishedExports,
      }}
      proposals={proposals.map((proposal) => ({
        id: proposal.id,
        noteId: proposal.noteId,
        title: proposal.title,
        status: proposal.status,
        summary: proposal.summary ?? null,
        noteTitle: proposal.note.title,
      }))}
      noteGptSeed={{
        notes: notes.map((note) => ({
          id: note.id,
          title: note.title,
          icon: note.icon,
          folderId: note.folderId ?? null,
          updatedAtLabel: note.updatedAt.toISOString(),
        })),
        folders: folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          icon: folder.icon,
          parentId: folder.parentId ?? null,
        })),
      }}
      settingsLogs={operationLogs.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        appliedAt: entry.appliedAt?.toISOString() ?? null,
      }))}
    />
  );
}
