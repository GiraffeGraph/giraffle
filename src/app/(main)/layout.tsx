import { RightRail } from "@/components/right-rail/RightRail";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { buildTemplatePreviewFromBlocks } from "@/domain/template/template.preview";
import { getFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";
import { getSpotterSessionsAction } from "@/server/api/spotter";
import { getWorkspaceTagsAction } from "@/server/api/tags";
import { getTemplatesAction } from "@/server/api/templates";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notes, folders, templates, tags, spotterSessions] = await Promise.all([
    getNotesAction(),
    getFoldersAction(),
    getTemplatesAction(),
    getWorkspaceTagsAction(),
    getSpotterSessionsAction(),
  ]);

  return (
    <div className="app-layout">
      <Sidebar
        notes={notes}
        folders={folders}
        templates={templates.map((template) => ({
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
        }))}
        tags={tags}
        spotterSessions={spotterSessions}
      />
      <main className="main-content">
        <div className="main-content-inner">{children}</div>
      </main>
      <RightRail />
    </div>
  );
}
