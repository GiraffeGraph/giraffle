-- Transition Savanna from React Flow node/edge tables to native Excalidraw JSON.

ALTER TABLE "Canvas"
  ADD COLUMN "elements" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "appState" JSONB NOT NULL DEFAULT '{}';

UPDATE "Canvas" AS c
SET
  "elements" = COALESCE(
    (
      SELECT jsonb_agg(migrated.element ORDER BY migrated.sort_group, migrated.sort_key)
      FROM (
        SELECT
          0 AS sort_group,
          n."id" AS sort_key,
          jsonb_build_object(
            'id', n."id",
            'type', 'text',
            'x', n."x",
            'y', n."y",
            'width', GREATEST(n."width", 180),
            'height', GREATEST(CEIL(n."height" / 2), 32),
            'angle', 0,
            'strokeColor', '#1e1e1e',
            'backgroundColor', 'transparent',
            'fillStyle', 'solid',
            'strokeWidth', 2,
            'strokeStyle', 'solid',
            'roughness', 1,
            'opacity', 100,
            'groupIds', '[]'::jsonb,
            'frameId', NULL,
            'roundness', NULL,
            'seed', FLOOR(random() * 2147483647)::int,
            'version', 1,
            'versionNonce', FLOOR(random() * 2147483647)::int,
            'isDeleted', false,
            'boundElements', NULL,
            'updated', (EXTRACT(EPOCH FROM c."updatedAt") * 1000)::bigint,
            'link', CASE WHEN n."noteId" IS NULL THEN NULL ELSE '/notes/' || n."noteId" END,
            'locked', false,
            'text', CASE
              WHEN n."type" IN ('noteCard', 'note') THEN CONCAT(
                COALESCE(NULLIF(n."data" ->> 'icon', ''), note."icon", '📄'),
                ' ',
                COALESCE(NULLIF(n."data" ->> 'title', ''), note."title", 'Untitled')
              )
              WHEN n."type" IN ('label', 'canvasText', 'textBlock') THEN COALESCE(NULLIF(n."data" ->> 'text', ''), 'Text')
              WHEN n."type" = 'zone' THEN COALESCE(NULLIF(n."data" ->> 'label', ''), 'Zone')
              WHEN n."type" IN ('inkStroke', 'draw') THEN 'Drawing'
              ELSE COALESCE(NULLIF(n."data" ->> 'title', ''), NULLIF(n."data" ->> 'text', ''), n."type", 'Element')
            END,
            'fontSize', 24,
            'fontFamily', 5,
            'textAlign', 'left',
            'verticalAlign', 'top',
            'containerId', NULL,
            'originalText', CASE
              WHEN n."type" IN ('noteCard', 'note') THEN CONCAT(
                COALESCE(NULLIF(n."data" ->> 'icon', ''), note."icon", '📄'),
                ' ',
                COALESCE(NULLIF(n."data" ->> 'title', ''), note."title", 'Untitled')
              )
              WHEN n."type" IN ('label', 'canvasText', 'textBlock') THEN COALESCE(NULLIF(n."data" ->> 'text', ''), 'Text')
              WHEN n."type" = 'zone' THEN COALESCE(NULLIF(n."data" ->> 'label', ''), 'Zone')
              WHEN n."type" IN ('inkStroke', 'draw') THEN 'Drawing'
              ELSE COALESCE(NULLIF(n."data" ->> 'title', ''), NULLIF(n."data" ->> 'text', ''), n."type", 'Element')
            END,
            'autoResize', true,
            'lineHeight', 1.25
          ) AS element
        FROM "CanvasNode" AS n
        LEFT JOIN "Note" AS note ON note."id" = n."noteId"
        WHERE n."canvasId" = c."id"

        UNION ALL

        SELECT
          1 AS sort_group,
          e."id" AS sort_key,
          jsonb_build_object(
            'id', e."id",
            'type', 'arrow',
            'x', source."x" + source."width" / 2,
            'y', source."y" + source."height" / 2,
            'width', (target."x" + target."width" / 2) - (source."x" + source."width" / 2),
            'height', (target."y" + target."height" / 2) - (source."y" + source."height" / 2),
            'angle', 0,
            'strokeColor', '#8465d9',
            'backgroundColor', 'transparent',
            'fillStyle', 'solid',
            'strokeWidth', 2,
            'strokeStyle', 'solid',
            'roughness', 1,
            'opacity', 100,
            'groupIds', '[]'::jsonb,
            'frameId', NULL,
            'roundness', jsonb_build_object('type', 2),
            'seed', FLOOR(random() * 2147483647)::int,
            'version', 1,
            'versionNonce', FLOOR(random() * 2147483647)::int,
            'isDeleted', false,
            'boundElements', NULL,
            'updated', (EXTRACT(EPOCH FROM c."updatedAt") * 1000)::bigint,
            'link', NULL,
            'locked', false,
            'points', jsonb_build_array(
              jsonb_build_array(0, 0),
              jsonb_build_array(
                (target."x" + target."width" / 2) - (source."x" + source."width" / 2),
                (target."y" + target."height" / 2) - (source."y" + source."height" / 2)
              )
            ),
            'lastCommittedPoint', NULL,
            'startBinding', NULL,
            'endBinding', NULL,
            'startArrowhead', NULL,
            'endArrowhead', 'arrow'
          ) AS element
        FROM "CanvasEdge" AS e
        JOIN "CanvasNode" AS source ON source."id" = e."sourceNodeId" AND source."canvasId" = e."canvasId"
        JOIN "CanvasNode" AS target ON target."id" = e."targetNodeId" AND target."canvasId" = e."canvasId"
        WHERE e."canvasId" = c."id"
      ) AS migrated
    ),
    '[]'::jsonb
  ),
  "appState" = jsonb_build_object(
    'viewBackgroundColor', '#ffffff',
    'scrollX', -c."cameraX",
    'scrollY', -c."cameraY",
    'zoom', jsonb_build_object('value', c."zoom")
  );

DROP TABLE "CanvasEdge";
DROP TABLE "CanvasNode";

ALTER TABLE "Canvas"
  DROP COLUMN "cameraX",
  DROP COLUMN "cameraY",
  DROP COLUMN "zoom";
