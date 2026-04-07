import Link from "next/link";
import {
  createTemplateAction,
  deleteTemplateAction,
  getTemplatesAction,
  updateTemplateAction,
} from "@/server/api/templates";
import { AppPageHeader } from "@/components/ui/AppPageHeader";
import {
  blocksToMarkdown,
  markdownToBlocks,
} from "@/domain/note/note.serializer";
import {
  documentToTemplateBlocks,
  templateBlocksToDocument,
} from "@/domain/template/template.document";
import {
  TEMPLATE_CATEGORIES,
  type TemplateVariable,
} from "@/domain/template/template.types";
import { getTemplateCategoryLabel } from "@/lib/template-category";

interface TemplatesPageProps {
  searchParams: Promise<{
    selected?: string;
  }>;
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const params = await searchParams;
  const templates = await getTemplatesAction();
  const templateCategoryOptions = TEMPLATE_CATEGORIES.map((category) => ({
    value: category,
    label: getTemplateCategoryLabel(category),
  }));
  const selectedTemplate =
    templates.find((template) => template.id === params.selected) ?? templates[0] ?? null;

  async function handleCreateTemplate(formData: FormData) {
    "use server";
    await createTemplateAction({
      name: String(formData.get("name") ?? "").trim() || "Yeni Şablon",
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: String(formData.get("category") ?? "custom"),
      icon: String(formData.get("icon") ?? "").trim() || undefined,
      blocks: documentToTemplateBlocks(
        markdownToBlocks(String(formData.get("markdown") ?? ""))
      ),
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
      blocks: documentToTemplateBlocks(
        markdownToBlocks(String(formData.get("markdown") ?? ""))
      ),
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
    <div className="dashboard templates-page app-page">
      <AppPageHeader
        eyebrow="Sistem"
        title="Şablonlar"
        description="Tekrarlanan not başlangıçlarını, ritüelleri ve ekip formatlarını tutarlı hale getir."
        meta={`${templates.length} şablon`}
      />

      <div className="templates-layout">
        <section className="templates-column templates-list-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Şablon kütüphanesi</span>
          </div>
          <div className="search-result-grid">
            {templates.map((template) => (
              <Link
                key={template.id}
                href={`/templates?selected=${template.id}`}
                className={`search-result-card ${
                  selectedTemplate?.id === template.id ? "active" : ""
                }`}
              >
                <span className="search-result-title">{template.name}</span>
                <span className="search-result-meta">
                  {getTemplateCategoryLabel(template.category)}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Yeni şablon</span>
          </div>
          <form action={handleCreateTemplate} className="settings-panel">
            <label className="settings-field">
              <span>Ad</span>
              <input name="name" placeholder="Şablon adı" />
            </label>
            <label className="settings-field">
              <span>Açıklama</span>
              <textarea name="description" placeholder="Kısa açıklama" rows={3} />
            </label>
            <label className="settings-field">
              <span>Kategori</span>
              <select name="category" defaultValue="custom">
                {templateCategoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>İkon</span>
              <input name="icon" placeholder="Not" />
            </label>
            <label className="settings-field">
              <span>Değişkenler (JSON)</span>
              <textarea
                name="variablesJson"
                rows={6}
                defaultValue="[]"
                placeholder='[{"name":"date","label":"Tarih","type":"date"}]'
              />
            </label>
            <label className="settings-field">
              <span>Başlangıç Markdown</span>
              <textarea
                name="markdown"
                rows={12}
                placeholder="# Şablon başlığı"
              />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Şablon oluştur
            </button>
          </form>

          {selectedTemplate ? (
            <>
              <div className="dashboard-section-head">
                <span className="dashboard-section-kicker">Seçili şablon</span>
              </div>
              <form action={handleUpdateTemplate} className="settings-panel">
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <label className="settings-field">
                  <span>Ad</span>
                  <input name="name" defaultValue={selectedTemplate.name} />
                </label>
                <label className="settings-field">
                  <span>Açıklama</span>
                  <textarea
                    name="description"
                    defaultValue={selectedTemplate.description ?? ""}
                    rows={3}
                  />
                </label>
                <label className="settings-field">
                  <span>Kategori</span>
                  <select name="category" defaultValue={selectedTemplate.category}>
                    {templateCategoryOptions.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>İkon</span>
                  <input name="icon" defaultValue={selectedTemplate.icon ?? ""} />
                </label>
                <label className="settings-field">
                  <span>Değişkenler (JSON)</span>
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
                  <span>Başlangıç Markdown</span>
                  <textarea
                    name="markdown"
                    rows={12}
                    defaultValue={blocksToMarkdown(
                      templateBlocksToDocument(selectedTemplate.blocks)
                    )}
                  />
                </label>
                <button type="submit" className="dashboard-empty-btn">
                  Güncelle
                </button>
              </form>
              <form action={handleDeleteTemplate}>
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <button type="submit" className="dashboard-secondary-btn">
                  Şablonu sil
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
