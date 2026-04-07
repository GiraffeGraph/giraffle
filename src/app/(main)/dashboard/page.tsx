import Link from "next/link";
import { AppPageHeader } from "@/components/ui/AppPageHeader";
import { getNotesAction } from "@/server/api/notes";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";

export default async function DashboardPage() {
  const notes = await getNotesAction();

  return (
    <div className="dashboard app-page">
      <AppPageHeader
        eyebrow="Çalışma alanı"
        title="Pano"
        description="Son dokunulan notlara, taslaklara ve çalışma alanının ana akışına hızlıca geri dön."
        meta={`${notes.length} not`}
      />

      <div style={{ padding: "0 32px 32px", maxWidth: "1200px", margin: "0 auto" }}>
        {notes.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px", color: "var(--md-sys-color-on-surface-variant)", border: "1px dashed var(--md-sys-color-outline-variant)", borderRadius: "var(--md-sys-shape-large)" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.5 }}>Boş</div>
            <p style={{ fontSize: "var(--md-sys-typescale-body-large-size)" }}>
              Henüz not yok. Boş bir not oluştur ya da hazır bir şablon seç.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                style={{ textDecoration: "none" }}
              >
                <Card variant="outlined" isClickable style={{ height: "100%", padding: "16px", transition: "all 0.2s" }}>
                  <CardContent style={{ padding: 0, display: "flex", alignItems: "flex-start", gap: "16px", height: "100%" }}>
                    <div style={{ fontSize: "24px", color: "var(--md-sys-color-primary)", flexShrink: 0 }}>
                      {note.icon ?? "Not"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <div style={{ fontWeight: "bold", fontSize: "var(--md-sys-typescale-title-medium-size)", color: "var(--md-sys-color-on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {note.title}
                      </div>
                      <div style={{ fontSize: "var(--md-sys-typescale-body-small-size)", color: "var(--md-sys-color-on-surface-variant)", marginTop: "4px" }}>
                        {formatDate(new Date(note.updatedAt))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
