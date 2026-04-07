"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyTemplateAction } from "@/server/api/templates";
import type { TemplateVariable } from "@/domain/template/template.types";
import { getTemplateCategoryLabel } from "@/lib/template-category";
import { Button } from "@/components/ui/Button";

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
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
  const [title, setTitle] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
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
      <Button
        variant="tonal"
        className={buttonClassName}
        onClick={openPicker}
      >
        {buttonLabel}
      </Button>

      {isOpen ? (
        <div className="md-dialog-scrim" onClick={closePicker}>
          <div
            className="md-dialog"
            style={{ maxWidth: "800px", width: "90vw", flexDirection: "row", padding: "0", overflow: "hidden", minHeight: "500px" }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Sidebar / List area */}
            <div style={{ flex: "1", borderRight: "1px solid var(--md-sys-color-outline-variant)", display: "flex", flexDirection: "column", background: "var(--md-sys-color-surface-container-low)" }}>
              <div style={{ padding: "24px 24px 16px" }}>
                <h2 className="md-dialog-headline" style={{ marginBottom: "4px" }}>Şablondan Oluştur</h2>
                <p style={{ margin: 0, color: "var(--md-sys-color-on-surface-variant)", fontSize: "var(--md-sys-typescale-body-medium-size)" }}>
                  Boş sayfa yerine hazır bir yapıyla başla.
                </p>
              </div>

              <div style={{ flex: "1", overflowY: "auto", padding: "0 12px 16px 12px" }}>
                <ul className="md-list">
                  {templates.map((template) => {
                    const isActive = template.id === selectedTemplate?.id;
                    return (
                      <li
                        key={template.id}
                        className={`md-list-item ${isActive ? "md-list-item--active" : ""}`}
                        style={{ borderRadius: "var(--md-sys-shape-medium)", marginBottom: "4px" }}
                        onClick={() => handleTemplateChange(template.id)}
                      >
                        <div className="md-list-item-start" style={{ fontSize: "24px" }}>
                          {template.icon ?? getTemplateCategoryLabel(template.category).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="md-list-item-content">
                          <h3 className="md-list-item-headline">{template.name}</h3>
                          <p className="md-list-item-supporting-text">
                            {template.description ?? `${getTemplateCategoryLabel(template.category)} şablonu`}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Details / Form area */}
            <div style={{ flex: "1.5", display: "flex", flexDirection: "column", padding: "24px", background: "var(--md-sys-color-surface)" }}>
               <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                 <Button variant="text" icon onClick={closePicker} leadingIcon="close" aria-label="Kapat" />
               </div>

              {selectedTemplate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px", flex: "1" }}>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "var(--md-sys-shape-medium)", background: "var(--md-sys-color-primary-container)", color: "var(--md-sys-color-on-primary-container)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
                      {selectedTemplate.icon ?? getTemplateCategoryLabel(selectedTemplate.category).slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                        <h3 style={{ margin: "0", color: "var(--md-sys-color-on-surface)", fontSize: "var(--md-sys-typescale-title-large-size)" }}>{selectedTemplate.name}</h3>
                        <p style={{ margin: "4px 0 0 0", color: "var(--md-sys-color-on-surface-variant)", fontSize: "var(--md-sys-typescale-body-medium-size)" }}>
                          {selectedTemplate.description ?? `${getTemplateCategoryLabel(selectedTemplate.category)} şablonu`}
                        </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Native Input replaced with Outlined Text Field pattern */}
                    <div className="md-text-field md-text-field--outlined">
                      <div className="md-text-field-container">
                        <input
                          className="md-text-field-input"
                          placeholder=" "
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                        <span className="md-text-field-label">Not başlığı (opsiyonel)</span>
                      </div>
                    </div>

                    {selectedTemplate.variables.map((variable) => (
                       <div key={variable.name} className="md-text-field md-text-field--outlined">
                         <div className="md-text-field-container">
                           <input
                             className="md-text-field-input"
                             placeholder=" "
                             value={variableValues[variable.name] ?? ""}
                             onChange={(e) =>
                               setVariableValues((currentValue) => ({
                                 ...currentValue,
                                 [variable.name]: e.target.value,
                               }))
                             }
                           />
                           <span className="md-text-field-label">{variable.label}</span>
                         </div>
                       </div>
                    ))}
                  </div>

                  <div className="md-dialog-actions" style={{ marginTop: "auto" }}>
                    <Button variant="text" onClick={closePicker}>
                      İptal
                    </Button>
                    <Button
                      variant="filled"
                      disabled={isPending}
                      onClick={handleCreateNote}
                    >
                      {isPending ? "Oluşturuluyor..." : "Not Oluştur"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
