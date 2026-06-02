-- Remove Trails (connectors) and OpenAI key integration.
-- The in-app agent loop was replaced by external MCP-driven control, so these
-- tables are obsolete. Child tables dropped before Trail to respect FKs.
-- Note: intentionally does NOT touch Note.searchVector (FTS, unrelated).

DROP TABLE IF EXISTS "TrailCredential";
DROP TABLE IF EXISTS "TrailToolAllow";
DROP TABLE IF EXISTS "TrailLog";
DROP TABLE IF EXISTS "Trail";
DROP TABLE IF EXISTS "UserIntegrationSetting";
