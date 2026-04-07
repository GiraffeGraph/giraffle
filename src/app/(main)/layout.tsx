import { Sidebar } from "@/components/sidebar/Sidebar";
import { RightRail } from "@/components/right-rail/RightRail";
import { auth } from "@/lib/auth";
import { getFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";
import { getWorkspaceTagsAction } from "@/server/api/tags";
import { getTemplatesAction } from "@/server/api/templates";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, notes, folders, templates, tags] = await Promise.all([
    auth(),
    getNotesAction(),
    getFoldersAction(),
    getTemplatesAction(),
    getWorkspaceTagsAction(),
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
          variables: template.variables as Array<{
            name: string;
            label: string;
            type: "text" | "date" | "select";
            defaultValue?: string;
            options?: string[];
          }>,
        }))}
        tags={tags}
        user={{
          name: session?.user?.name ?? null,
          email: session?.user?.email ?? null,
        }}
      />
      <main className="main-content">
        <div className="main-content-inner">{children}</div>
      </main>
      <RightRail />
    </div>
  );
}
