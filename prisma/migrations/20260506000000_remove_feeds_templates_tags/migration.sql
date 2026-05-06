-- Drop feature tables removed from the app.
DROP TABLE IF EXISTS "WorkspaceFeedItem" CASCADE;
DROP TABLE IF EXISTS "WorkspaceFeedSource" CASCADE;
DROP TABLE IF EXISTS "WorkspaceFeed" CASCADE;
DROP TABLE IF EXISTS "NoteTag" CASCADE;
DROP TABLE IF EXISTS "Tag" CASCADE;
DROP TABLE IF EXISTS "Template" CASCADE;

-- Drop template linkage from notes.
ALTER TABLE "Note" DROP COLUMN IF EXISTS "templateId";
