-- Remove editor blocks that depended on the retired in-app Spotter runtime.
DELETE FROM "Block" WHERE "type" = 'spotterBlock';

-- Conversation history belonged exclusively to the removed embedded AI UI.
DROP TABLE IF EXISTS "SpotterMessage";
DROP TABLE IF EXISTS "SpotterSession";
