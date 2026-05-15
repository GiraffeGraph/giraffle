-- Full-text search support for Note.
-- Generated tsvector covers the title (plus future searchText we may add
-- when block content is materialised); GIN index keeps lookups cheap.

ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
      setweight(to_tsvector('simple', coalesce("searchText", '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS "note_search_vector_idx"
  ON "Note" USING GIN ("searchVector");
