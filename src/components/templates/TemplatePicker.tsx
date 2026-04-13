"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { applyTemplateAction } from "@/server/api/templates";
import type { TemplateVariable } from "@/domain/template/template.types";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { getTemplateCategoryLabel } from "@/lib/template-category";
import { Button } from "@/components/ui/Button";

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  previewText?: string;
  variables: TemplateVariable[];
}

interface TemplatePickerProps {
  templates: TemplateSummary[];
  folderId?: string | null;
  buttonLabel: string;
  buttonClassName?: string;
  openSignal?: number;
}

export function TemplatePicker({
  templates,
  folderId,
  buttonLabel,
  buttonClassName,
  openSignal = 0,
}: TemplatePickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null
  );
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [title, setTitle] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {}
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(templates.map((template) => template.category))).sort(
        (left, right) => left.localeCompare(right, "tr")
      ),
    [templates]
  );

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return templates.filter((template) => {
      if (selectedCategory !== "all" && template.category !== selectedCategory) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        template.name,
        template.description ?? "",
        template.previewText ?? "",
        getTemplateCategoryLabel(template.category),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [searchQuery, selectedCategory, templates]);

  const activeTemplateId = useMemo(
    () =>
      filteredTemplates.some((template) => template.id === selectedTemplateId)
        ? selectedTemplateId
        : filteredTemplates[0]?.id ?? null,
    [filteredTemplates, selectedTemplateId]
  );

  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((template) => template.id === activeTemplateId) ??
      templates.find((template) => template.id === activeTemplateId) ??
      null,
    [activeTemplateId, filteredTemplates, templates]
  );

  const openPicker = useCallback(() => {
    setSelectedTemplateId((currentValue) => currentValue ?? templates[0]?.id ?? null);
    setIsOpen(true);
  }, [templates]);

  useEffect(() => {
    if (openSignal <= 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      openPicker();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [openPicker, openSignal]);

  const closePicker = () => {
    setIsOpen(false);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setVariableValues({});
    setTitle("");
  };

  const handleCreateNote = () => {
    if (!selectedTemplate) {
      return;
    }

    startTransition(async () => {
      const noteId = await applyTemplateAction({
        templateId: selectedTemplate.id,
        title: title.trim() || undefined,
        folderId: folderId ?? undefined,
        variables: variableValues,
      });

      closePicker();
      router.push(`/notes/${noteId}`);
    });
  };

  return (
    <>
      <Button variant="tonal" className={buttonClassName} onClick={openPicker}>
        {buttonLabel}
      </Button>

      {isOpen ? (
        <div className="md-dialog-scrim" onClick={closePicker}>
          <div
            className="md-dialog"
            style={{
              maxWidth: "960px",
              width: "94vw",
              minHeight: "560px",
              padding: 0,
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "320px minmax(0, 1fr)",
                minHeight: "560px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: "auto auto auto minmax(0, 1fr)",
                  gap: "12px",
                  padding: "24px 18px 18px",
                  borderRight: "1px solid var(--md-sys-color-outline-variant)",
                  background: "var(--md-sys-color-surface-container-low)",
                }}
              >
                <div>
                  <h2 className="md-dialog-headline" style={{ marginBottom: "4px" }}>
                    Create note from template
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--md-sys-color-on-surface-variant)",
                      fontSize: "var(--md-sys-typescale-body-medium-size)",
                    }}
                  >
                    Search, narrow by category, and inspect the preview.
                  </p>
                </div>

                <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                  <div className="md-text-field-container">
                    <input
                      className="md-text-field-input"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder=" "
                    />
                    <span className="md-text-field-label">Search templates</span>
                  </div>
                </div>

                <label
                  style={{
                    display: "grid",
                    gap: "4px",
                    fontSize: "var(--md-sys-typescale-label-medium-size)",
                    color: "var(--md-sys-color-on-surface-variant)",
                  }}
                >
                  <span>Category</span>
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    style={buildTemplateSelectStyle()}
                  >
                    <option value="all">All categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {getTemplateCategoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ overflowY: "auto", paddingRight: "4px" }}>
                  {filteredTemplates.length > 0 ? (
                    <ul className="md-list">
                      {filteredTemplates.map((template) => {
                        const isActive = template.id === selectedTemplate?.id;
                        return (
                          <li
                            key={template.id}
                            className={`md-list-item ${isActive ? "md-list-item--active" : ""}`}
                            style={{
                              borderRadius: "12px",
                              marginBottom: "6px",
                            }}
                            onClick={() => handleTemplateChange(template.id)}
                          >
                            <div
                              className="md-list-item-start"
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "10px",
                                display: "grid",
                                placeItems: "center",
                                background: "var(--md-sys-color-surface-container-high)",
                                fontSize: "18px",
                              }}
                            >
                              {renderStoredIcon(template.icon, {
                                fallback: getTemplateCategoryLabel(template.category)
                                  .slice(0, 1)
                                  .toUpperCase(),
                                materialClassName: "material-symbols-outlined",
                                emojiStyle: { fontSize: "18px", lineHeight: 1 },
                              })}
                            </div>
                            <div className="md-list-item-content">
                              <h3 className="md-list-item-headline">{template.name}</h3>
                              <p className="md-list-item-supporting-text">
                                {template.description ??
                                  `${getTemplateCategoryLabel(template.category)} template`}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div
                      style={{
                        padding: "24px 12px",
                        borderRadius: "14px",
                        textAlign: "center",
                        color: "var(--md-sys-color-on-surface-variant)",
                        background: "var(--md-sys-color-surface)",
                      }}
                    >
                      No templates match the filters.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: "auto minmax(0, 1fr) auto",
                  padding: "24px",
                  gap: "20px",
                  background: "var(--md-sys-color-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                  }}
                >
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "16px",
                        background: "var(--md-sys-color-primary-container)",
                        color: "var(--md-sys-color-on-primary-container)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "24px",
                        flexShrink: 0,
                      }}
                    >
                      {renderStoredIcon(selectedTemplate?.icon, {
                        fallback: selectedTemplate
                          ? getTemplateCategoryLabel(selectedTemplate.category)
                              .slice(0, 1)
                              .toUpperCase()
                          : "T",
                        materialClassName: "material-symbols-outlined",
                        emojiStyle: { fontSize: "24px", lineHeight: 1 },
                      })}
                    </div>

                    <div>
                      <h3
                        style={{
                          margin: 0,
                          color: "var(--md-sys-color-on-surface)",
                          fontSize: "var(--md-sys-typescale-title-large-size)",
                        }}
                      >
                        {selectedTemplate?.name ?? "Select a template"}
                      </h3>
                      <p
                        style={{
                          margin: "4px 0 0 0",
                          color: "var(--md-sys-color-on-surface-variant)",
                          fontSize: "var(--md-sys-typescale-body-medium-size)",
                        }}
                      >
                        {selectedTemplate
                          ? selectedTemplate.description ??
                            `${getTemplateCategoryLabel(selectedTemplate.category)} template`
                          : "Select a template from the list on the left."}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="text"
                    icon
                    onClick={closePicker}
                    leadingIcon="close"
                    aria-label="Kapat"
                  />
                </div>

                {selectedTemplate ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "20px",
                      alignContent: "start",
                      overflowY: "auto",
                      paddingRight: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        padding: "16px",
                        borderRadius: "16px",
                        background: "var(--md-sys-color-surface-container-low)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "var(--md-sys-typescale-label-medium-size)",
                          color: "var(--md-sys-color-on-surface-variant)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Preview
                      </div>
                      <div
                        style={{
                          color: "var(--md-sys-color-on-surface)",
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {selectedTemplate.previewText ??
                          selectedTemplate.description ??
                          "There is no preview for this template."}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "16px",
                      }}
                    >
                      <div className="md-text-field md-text-field--outlined md-text-field--has-value">
                        <div className="md-text-field-container">
                          <input
                            className="md-text-field-input"
                            placeholder=" "
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                          />
                          <span className="md-text-field-label">
                            Note title (optional)
                          </span>
                        </div>
                      </div>

                      {selectedTemplate.variables.length > 0 ? (
                        <div style={{ display: "grid", gap: "12px" }}>
                          {selectedTemplate.variables.map((variable) => (
                            <div
                              key={variable.name}
                              className="md-text-field md-text-field--outlined md-text-field--has-value"
                            >
                              <div className="md-text-field-container">
                                <input
                                  className="md-text-field-input"
                                  placeholder=" "
                                  value={variableValues[variable.name] ?? ""}
                                  onChange={(event) =>
                                    setVariableValues((currentValue) => ({
                                      ...currentValue,
                                      [variable.name]: event.target.value,
                                    }))
                                  }
                                />
                                <span className="md-text-field-label">
                                  {variable.label}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "12px 14px",
                            borderRadius: "12px",
                            background:
                              "var(--md-sys-color-surface-container-low)",
                            color: "var(--md-sys-color-on-surface-variant)",
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            inventory_2
                          </span>
                          This template does not require variables.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "18px",
                      background: "var(--md-sys-color-surface-container-low)",
                      color: "var(--md-sys-color-on-surface-variant)",
                    }}
                  >
                    Select a template matching the filters.
                  </div>
                )}

                <div className="md-dialog-actions" style={{ marginTop: "auto" }}>
                  <Button variant="text" onClick={closePicker}>
                    Cancel
                  </Button>
                  <Button
                    variant="filled"
                    disabled={isPending || !selectedTemplate}
                    onClick={handleCreateNote}
                  >
                    {isPending ? "Creating..." : "Create note"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function buildTemplateSelectStyle() {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid var(--md-sys-color-outline)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "14px",
  } as const;
}
