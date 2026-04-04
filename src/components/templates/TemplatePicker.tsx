"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyTemplateAction } from "@/server/api/templates";
import type { TemplateVariable } from "@/domain/template/template.types";

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
}

export function TemplatePicker({
  templates,
  folderId,
  buttonLabel,
  buttonClassName,
}: TemplatePickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null
  );
  const [title, setTitle] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {}
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const openPicker = () => {
    setSelectedTemplateId((currentValue) => currentValue ?? templates[0]?.id ?? null);
    setIsOpen(true);
  };

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
      <button
        type="button"
        className={buttonClassName}
        onClick={openPicker}
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="template-picker-overlay" onClick={closePicker}>
          <div
            className="template-picker-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="template-picker-header">
              <div>
                <h2 className="template-picker-title">Create From Template</h2>
                <p className="template-picker-subtitle">
                  Start from a structured note instead of a blank page.
                </p>
              </div>
              <button
                type="button"
                className="template-picker-close"
                onClick={closePicker}
              >
                Close
              </button>
            </div>

            <div className="template-picker-body">
              <div className="template-picker-list">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`template-picker-item ${
                      template.id === selectedTemplate?.id ? "active" : ""
                    }`}
                    onClick={() => handleTemplateChange(template.id)}
                  >
                    <span className="template-picker-item-icon">
                      {template.icon ?? template.category.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="template-picker-item-copy">
                      <span className="template-picker-item-title">
                        {template.name}
                      </span>
                      <span className="template-picker-item-description">
                        {template.description ?? "Structured starter template"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {selectedTemplate ? (
                <div className="template-picker-panel">
                  <div className="template-picker-panel-header">
                    <div className="template-picker-panel-icon">
                      {selectedTemplate.icon ??
                        selectedTemplate.category.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="template-picker-panel-title">
                        {selectedTemplate.name}
                      </div>
                      <div className="template-picker-panel-description">
                        {selectedTemplate.description ??
                          "Structured starter template"}
                      </div>
                    </div>
                  </div>

                  <label className="template-picker-field">
                    <span>Note title</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={selectedTemplate.name}
                    />
                  </label>

                  {selectedTemplate.variables.map((variable) => (
                    <label
                      key={variable.name}
                      className="template-picker-field"
                    >
                      <span>{variable.label}</span>
                      <input
                        value={variableValues[variable.name] ?? ""}
                        onChange={(event) =>
                          setVariableValues((currentValue) => ({
                            ...currentValue,
                            [variable.name]: event.target.value,
                          }))
                        }
                        placeholder={variable.defaultValue ?? ""}
                      />
                    </label>
                  ))}

                  <button
                    type="button"
                    className="template-picker-submit"
                    disabled={isPending}
                    onClick={handleCreateNote}
                  >
                    {isPending ? "Creating..." : "Create Note"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
