import { createTemplateAction, deleteTemplateAction, getTemplatesAction, updateTemplateAction } from "@/server/api/templates";
import {
  blocksToMarkdown,
  markdownToBlocks,
} from "@/domain/note/note.serializer";
import type {
  TemplateBlock,
  TemplateVariable,
} from "@/domain/template/template.types";

interface TemplatesPageProps {
  searchParams: Promise<{
    selected?: string;
  }>;
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const params = await searchParams;
  const templates = await getTemplatesAction();
  const selectedTemplate =
    templates.find((template) => template.id === params.selected) ?? templates[0] ?? null;

  async function handleCreateTemplate(formData: FormData) {
    "use server";
    await createTemplateAction({
      name: String(formData.get("name") ?? "").trim() || "Yeni Sablon",
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: String(formData.get("category") ?? "custom"),
      icon: String(formData.get("icon") ?? "").trim() || undefined,
      blocks: markdownToBlocks(
        String(formData.get("markdown") ?? "")
      ).content as unknown as TemplateBlock[],
      variables: parseTemplateVariables(String(formData.get("variablesJson") ?? "")),
    });
  }

  async function handleUpdateTemplate(formData: FormData) {
    "use server";
    const templateId = String(formData.get("templateId") ?? "");

    if (!templateId) {
      return;
    }

    await updateTemplateAction(templateId, {
      name: String(formData.get("name") ?? "").trim() || undefined,
      description: String(formData.get("description") ?? "").trim() || null,
      category: String(formData.get("category") ?? "custom"),
      icon: String(formData.get("icon") ?? "").trim() || null,
      blocks: markdownToBlocks(
        String(formData.get("markdown") ?? "")
      ).content as unknown as TemplateBlock[],
      variables: parseTemplateVariables(String(formData.get("variablesJson") ?? "")),
    });
  }

  async function handleDeleteTemplate(formData: FormData) {
    "use server";
    const templateId = String(formData.get("templateId") ?? "");

    if (!templateId) {
      return;
    }

    await deleteTemplateAction(templateId);
  }

  return (
    <div className="dashboard templates-page">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Sablon kutuphanesi</div>
          <h1 className="dashboard-title">Sablonlar</h1>
          <p className="dashboard-subtitle">
            Seed edilen sablonlari yonet, yeni custom sablonlar olustur.
          </p>
        </div>
      </section>

      <div className="templates-layout">
        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Mevcut sablonlar</span>
          </div>
          <div className="search-result-grid">
            {templates.map((template) => (
              <a
                key={template.id}
                href={`/templates?selected=${template.id}`}
                className={`search-result-card ${
                  selectedTemplate?.id === template.id ? "active" : ""
                }`}
              >
                <span className="search-result-title">{template.name}</span>
                <span className="search-result-meta">{template.category}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Yeni sablon</span>
          </div>
          <form action={handleCreateTemplate} className="settings-panel">
            <label className="settings-field">
              <span>Ad</span>
              <input name="name" placeholder="Sablon adi" />
            </label>
            <label className="settings-field">
              <span>Aciklama</span>
              <textarea name="description" placeholder="Kisa aciklama" rows={3} />
            </label>
            <label className="settings-field">
              <span>Kategori</span>
              <select name="category">
                <option value="custom">custom</option>
                <option value="daily">daily</option>
                <option value="meeting">meeting</option>
                <option value="project">project</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Ikon</span>
              <input name="icon" placeholder="Not" />
            </label>
            <label className="settings-field">
              <span>Degiskenler (JSON)</span>
              <textarea
                name="variablesJson"
                rows={6}
                defaultValue="[]"
                placeholder='[{"name":"date","label":"Tarih","type":"date"}]'
              />
            </label>
            <label className="settings-field">
              <span>Baslangic Markdown</span>
              <textarea
                name="markdown"
                rows={12}
                placeholder="# Sablon basligi"
              />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Sablon olustur
            </button>
          </form>

          {selectedTemplate ? (
            <>
              <div className="dashboard-section-head">
                <span className="dashboard-section-kicker">Secili sablon</span>
              </div>
              <form action={handleUpdateTemplate} className="settings-panel">
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <label className="settings-field">
                  <span>Ad</span>
                  <input name="name" defaultValue={selectedTemplate.name} />
                </label>
                <label className="settings-field">
                  <span>Aciklama</span>
                  <textarea
                    name="description"
                    defaultValue={selectedTemplate.description ?? ""}
                    rows={3}
                  />
                </label>
                <label className="settings-field">
                  <span>Kategori</span>
                  <input name="category" defaultValue={selectedTemplate.category} />
                </label>
                <label className="settings-field">
                  <span>Ikon</span>
                  <input name="icon" defaultValue={selectedTemplate.icon ?? ""} />
                </label>
                <label className="settings-field">
                  <span>Degiskenler (JSON)</span>
                  <textarea
                    name="variablesJson"
                    rows={6}
                    defaultValue={JSON.stringify(
                      selectedTemplate.variables ?? [],
                      null,
                      2
                    )}
                  />
                </label>
                <label className="settings-field">
                  <span>Baslangic Markdown</span>
                  <textarea
                    name="markdown"
                    rows={12}
                    defaultValue={blocksToMarkdown({
                      type: "doc",
                      content: selectedTemplate.blocks as unknown as never[],
                    } as never)}
                  />
                </label>
                <button type="submit" className="dashboard-empty-btn">
                  Guncelle
                </button>
              </form>
              <form action={handleDeleteTemplate}>
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <button type="submit" className="dashboard-secondary-btn">
                  Sablonu sil
                </button>
              </form>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function parseTemplateVariables(value: string): TemplateVariable[] {
  if (!value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as TemplateVariable[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
