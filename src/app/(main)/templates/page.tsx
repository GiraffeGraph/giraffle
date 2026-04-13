import Link from "next/link";
import {
  createTemplateAction,
  deleteTemplateAction,
  getTemplatesAction,
  updateTemplateAction,
} from "@/server/api/templates";
import { PageTopbar } from "@/components/ui/PageTopbar";
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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
      name: String(formData.get("name") ?? "").trim() || "New Template",
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
    <>
      <PageTopbar icon="tooltip" label="Templates" />
      <div className="dashboard templates-page app-page">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", padding: "24px 32px 32px", maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Left Column: Library */}
        <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <span style={{ fontSize: "var(--md-sys-typescale-title-medium-size)", color: "var(--md-sys-color-on-background)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Template Library</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {templates.map((template) => {
              const isActive = selectedTemplate?.id === template.id;
              return (
                <Link
                  key={template.id}
                  href={`/templates?selected=${template.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <Card variant={isActive ? "filled" : "outlined"} isClickable style={{ background: isActive ? "var(--md-sys-color-secondary-container)" : "transparent", transition: "all 0.2s" }}>
                    <CardContent style={{ padding: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: "bold", fontSize: "var(--md-sys-typescale-title-medium-size)", color: isActive ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface)" }}>{template.name}</span>
                        <span style={{ fontSize: "var(--md-sys-typescale-body-small-size)", color: isActive ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface-variant)" }}>
                          {getTemplateCategoryLabel(template.category)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Right Column: Edit/Create Form */}
        <section style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {/* Create New Template */}
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>New Template</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={handleCreateTemplate} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", gap: "16px" }}>
                  <div className="md-text-field md-text-field--outlined" style={{ flex: 2 }}>
                    <div className="md-text-field-container">
                      <input className="md-text-field-input" name="name" placeholder=" " />
                      <span className="md-text-field-label">Name (e.g. Weekly Report)</span>
                    </div>
                  </div>
                  <div className="md-text-field md-text-field--outlined" style={{ flex: 1 }}>
                    <div className="md-text-field-container">
                      <input className="md-text-field-input" name="icon" placeholder=" " />
                      <span className="md-text-field-label">Icon (Emoji)</span>
                    </div>
                  </div>
                </div>

                <div className="md-text-field md-text-field--outlined">
                  <div className="md-text-field-container" style={{ height: "auto", minHeight: "80px", padding: "12px 16px" }}>
                    <textarea className="md-text-field-input" name="description" placeholder=" " rows={3} style={{ resize: "vertical", paddingTop: "0" }} />
                    <span className="md-text-field-label">Description</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "var(--md-sys-typescale-label-medium-size)", color: "var(--md-sys-color-on-surface-variant)", marginLeft: "4px" }}>Category</label>
                  <select name="category" defaultValue="custom" style={{ padding: "12px 16px", borderRadius: "var(--md-sys-shape-medium)", border: "1px solid var(--md-sys-color-outline)", background: "transparent", color: "var(--md-sys-color-on-surface)", fontSize: "var(--md-sys-typescale-body-large-size)" }}>
                    {templateCategoryOptions.map((category) => (
                      <option key={category.value} value={category.value} style={{ background: "var(--md-sys-color-surface-container)", color: "var(--md-sys-color-on-surface)" }}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md-text-field md-text-field--outlined">
                  <div className="md-text-field-container" style={{ height: "auto", minHeight: "120px", padding: "12px 16px" }}>
                    <textarea className="md-text-field-input" name="variablesJson" rows={4} defaultValue="[]" placeholder=" " style={{ resize: "vertical", paddingTop: "0", fontFamily: "monospace" }} />
                    <span className="md-text-field-label">Variables (JSON array)</span>
                  </div>
                </div>

                <div className="md-text-field md-text-field--outlined">
                  <div className="md-text-field-container" style={{ height: "auto", minHeight: "150px", padding: "12px 16px" }}>
                    <textarea className="md-text-field-input" name="markdown" rows={6} placeholder=" " style={{ resize: "vertical", paddingTop: "0", fontFamily: "monospace" }} />
                    <span className="md-text-field-label">Initial Markdown</span>
                  </div>
                </div>

                <Button type="submit" variant="filled" style={{ alignSelf: "flex-start", marginTop: "8px" }}>
                  Create Template
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Edit Selected Template */}
          {selectedTemplate ? (
            <Card variant="elevated" style={{ border: "2px solid var(--md-sys-color-primary)" }}>
              <CardHeader>
                <CardTitle>Selected Template: {selectedTemplate.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={handleUpdateTemplate} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <input type="hidden" name="templateId" value={selectedTemplate.id} />
                  
                  <div style={{ display: "flex", gap: "16px" }}>
                    <div className="md-text-field md-text-field--outlined md-text-field--has-value" style={{ flex: 2 }}>
                      <div className="md-text-field-container">
                        <input className="md-text-field-input" name="name" defaultValue={selectedTemplate.name} placeholder=" " />
                        <span className="md-text-field-label">Name</span>
                      </div>
                    </div>
                    <div className="md-text-field md-text-field--outlined md-text-field--has-value" style={{ flex: 1 }}>
                      <div className="md-text-field-container">
                        <input className="md-text-field-input" name="icon" defaultValue={selectedTemplate.icon ?? ""} placeholder=" " />
                        <span className="md-text-field-label">Icon</span>
                      </div>
                    </div>
                  </div>

                  <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                    <div className="md-text-field-container" style={{ height: "auto", minHeight: "80px", padding: "12px 16px" }}>
                      <textarea className="md-text-field-input" name="description" defaultValue={selectedTemplate.description ?? ""} rows={3} placeholder=" " style={{ resize: "vertical", paddingTop: "0" }} />
                      <span className="md-text-field-label">Description</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "var(--md-sys-typescale-label-medium-size)", color: "var(--md-sys-color-on-surface-variant)", marginLeft: "4px" }}>Category</label>
                    <select name="category" defaultValue={selectedTemplate.category} style={{ padding: "12px 16px", borderRadius: "var(--md-sys-shape-medium)", border: "1px solid var(--md-sys-color-outline)", background: "transparent", color: "var(--md-sys-color-on-surface)", fontSize: "var(--md-sys-typescale-body-large-size)" }}>
                      {templateCategoryOptions.map((category) => (
                        <option key={category.value} value={category.value} style={{ background: "var(--md-sys-color-surface-container)", color: "var(--md-sys-color-on-surface)" }}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                    <div className="md-text-field-container" style={{ height: "auto", minHeight: "120px", padding: "12px 16px" }}>
                      <textarea className="md-text-field-input" name="variablesJson" rows={4} defaultValue={JSON.stringify(selectedTemplate.variables ?? [], null, 2)} placeholder=" " style={{ resize: "vertical", paddingTop: "0", fontFamily: "monospace" }} />
                      <span className="md-text-field-label">Variables (JSON)</span>
                    </div>
                  </div>

                  <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                    <div className="md-text-field-container" style={{ height: "auto", minHeight: "200px", padding: "12px 16px" }}>
                      <textarea className="md-text-field-input" name="markdown" rows={10} defaultValue={blocksToMarkdown(templateBlocksToDocument(selectedTemplate.blocks))} placeholder=" " style={{ resize: "vertical", paddingTop: "0", fontFamily: "monospace" }} />
                      <span className="md-text-field-label">Initial Markdown</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <Button type="submit" variant="filled">
                      Update Template
                    </Button>
                    <Button
                      type="submit"
                      variant="tonal"
                      formAction={handleDeleteTemplate}
                      style={{ color: "var(--md-sys-color-error)" }}
                    >
                      Delete
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
    </>
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
