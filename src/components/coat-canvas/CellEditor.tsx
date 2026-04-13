"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";

interface CellEditorProps {
  cellId: string;
  initialContent: string; // Tiptap JSON string or ""
  onSave: (json: string) => void;
}

export function CellEditor({ cellId: _cellId, initialContent, onSave }: CellEditorProps) {
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const parsed = (() => {
    if (!initialContent) return undefined;
    try { return JSON.parse(initialContent); } catch { return undefined; }
  })();

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Add content…" }),
    ],
    immediatelyRender: false,
    content: parsed,
    onUpdate: ({ editor }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSaveRef.current(JSON.stringify(editor.getJSON()));
      }, 600);
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="cc-cell-editor">
      {editor && (
        <BubbleMenu editor={editor}>
          <div className="cc-bubble">
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("bold") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            ><strong>B</strong></button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("italic") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            ><em>I</em></button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("strike") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
            ><s>S</s></button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("code") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }}
            ><code>`</code></button>
            <div className="cc-bubble-sep" />
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("heading", { level: 2 }) ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
            >H2</button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("heading", { level: 3 }) ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }}
            >H3</button>
            <div className="cc-bubble-sep" />
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("bulletList") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
              title="Bullet list"
            ><span className="material-symbols-outlined" style={{ fontSize: 13 }}>format_list_bulleted</span></button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("orderedList") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
              title="Numbered list"
            ><span className="material-symbols-outlined" style={{ fontSize: 13 }}>format_list_numbered</span></button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("taskList") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }}
              title="Task list"
            ><span className="material-symbols-outlined" style={{ fontSize: 13 }}>checklist</span></button>
            <button
              type="button"
              className={`cc-bubble-btn${editor.isActive("blockquote") ? " cc-bubble-btn--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run(); }}
              title="Quote"
            ><span className="material-symbols-outlined" style={{ fontSize: 13 }}>format_quote</span></button>
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
