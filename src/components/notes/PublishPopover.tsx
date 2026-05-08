"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PublishPopoverProps {
  anchorRect: DOMRect;
  isPublished: boolean;
  slug: string | null;
  isPending: boolean;
  onTogglePublish: () => void | Promise<void>;
  onSlugChange: (next: string) => void | Promise<void>;
  onClose: () => void;
}

export function PublishPopover({
  anchorRect,
  isPublished,
  slug,
  isPending,
  onTogglePublish,
  onSlugChange,
  onClose,
}: PublishPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [draftSlug, setDraftSlug] = useState(slug ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const width = 320;
  const left = Math.min(
    Math.max(12, anchorRect.right - width),
    window.innerWidth - width - 12,
  );
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 180);

  const publishedHref = slug?.trim() ? `/published/${slug.trim()}` : null;

  const handleCommitSlug = async () => {
    const next = draftSlug.trim();
    if (next === (slug ?? "").trim()) return;
    await onSlugChange(next);
  };

  const handleCopyLink = async () => {
    if (!publishedHref || typeof window === "undefined") return;
    const fullUrl = `${window.location.origin}${publishedHref}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return createPortal(
    <div
      ref={popoverRef}
      className="publish-popover"
      style={{ top, left, width }}
      role="dialog"
      aria-label="Publish settings"
    >
      <div className="publish-popover-header">
        <div className="publish-popover-status">
          <span
            className={`publish-popover-dot${
              isPublished ? " publish-popover-dot--on" : ""
            }`}
            aria-hidden="true"
          />
          <span>{isPublished ? "Published" : "Draft"}</span>
        </div>
        <button
          type="button"
          className={`publish-popover-toggle${
            isPublished ? " publish-popover-toggle--unpublish" : ""
          }`}
          onClick={() => void onTogglePublish()}
          disabled={isPending}
        >
          {isPublished ? "Unpublish" : "Publish"}
        </button>
      </div>

      {isPublished ? (
        <>
          <label className="publish-popover-field">
            <span className="publish-popover-label">Path</span>
            <div className="publish-popover-path">
              <span className="publish-popover-prefix">/published/</span>
              <input
                className="publish-popover-input"
                value={draftSlug}
                onChange={(event) => setDraftSlug(event.target.value)}
                onBlur={() => void handleCommitSlug()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCommitSlug();
                    (event.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="my-note"
                spellCheck={false}
              />
            </div>
          </label>

          <button
            type="button"
            className="publish-popover-copy"
            onClick={handleCopyLink}
            disabled={!publishedHref}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {copied ? "check" : "link"}
            </span>
            <span>{copied ? "Link copied" : "Copy link"}</span>
          </button>
        </>
      ) : (
        <p className="publish-popover-hint">
          Note is currently a draft. Publish to share it via a public link.
        </p>
      )}
    </div>,
    document.body,
  );
}
