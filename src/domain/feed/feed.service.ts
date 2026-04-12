"use server";

import { db } from "@/lib/db";
import { recordOperation } from "@/domain/sync/operation-log.service";
import {
  buildNewsQueryPreview,
  loadTrustedNewsCandidates,
} from "./feed.rss";
import {
  buildSuggestionCandidates,
  type SuggestionFolderContext,
  type SuggestionNoteContext,
} from "./feed.suggestions";
import {
  WORKSPACE_FEED_KINDS,
  WORKSPACE_FEED_LANGUAGES,
  WORKSPACE_FEED_QUERY_MODES,
  type CreateWorkspaceFeedInput,
  type FeedAssignmentSummary,
  type FeedSourceBadge,
  type RefreshWorkspaceFeedResult,
  type UpdateWorkspaceFeedInput,
  type WorkspaceFeedKind,
  type WorkspaceFeedSourceInput,
  type WorkspaceFeedSummary,
} from "./feed.types";

const DEFAULT_ITEM_LIMIT = 8;
const SUGGESTION_REFRESH_HOURS = 12;
const NEWS_REFRESH_HOURS = 24;

export async function getWorkspaceFeeds(
  userId: string,
  options: {
    kind?: WorkspaceFeedKind;
    showOnDashboard?: boolean;
    autoRefresh?: boolean;
    itemLimit?: number;
  } = {},
): Promise<WorkspaceFeedSummary[]> {
  if (options.autoRefresh !== false) {
    try {
      await refreshDueFeedsForUser(userId, options.kind);
    } catch (error) {
      console.error("Failed to auto-refresh feeds", error);
    }
  }

  const feeds = await db.workspaceFeed.findMany({
    where: {
      userId,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.showOnDashboard ? { showOnDashboard: true } : {}),
    },
    include: {
      sources: {
        include: {
          note: {
            select: {
              id: true,
              title: true,
            },
          },
          folder: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      items: {
        orderBy: [
          { position: "asc" },
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
        take: options.itemLimit ?? DEFAULT_ITEM_LIMIT,
      },
      _count: {
        select: {
          items: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return feeds.map((feed) => mapFeedSummary(feed));
}

export async function getFeedAssignmentsForNote(
  userId: string,
  noteId: string,
): Promise<FeedAssignmentSummary[]> {
  await assertOwnedNote(userId, noteId);
  return getFeedAssignments(userId, { sourceType: "note", sourceId: noteId });
}

export async function getFeedAssignmentsForFolder(
  userId: string,
  folderId: string,
): Promise<FeedAssignmentSummary[]> {
  await assertOwnedFolder(userId, folderId);
  return getFeedAssignments(userId, { sourceType: "folder", sourceId: folderId });
}

export async function createWorkspaceFeed(
  userId: string,
  input: CreateWorkspaceFeedInput,
) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Feed title is required");
  }

  const kind = normalizeFeedKind(input.kind);
  const refreshIntervalHours = clampRefreshIntervalHours(
    input.refreshIntervalHours ??
      (kind === "suggestion" ? SUGGESTION_REFRESH_HOURS : NEWS_REFRESH_HOURS),
  );
  const language = normalizeFeedLanguage(input.language);
  const queryMode = normalizeFeedQueryMode(input.queryMode);
  const sources = await normalizeFeedSources(userId, input.sources ?? []);

  const feed = await db.workspaceFeed.create({
    data: {
      title,
      description: normalizeNullableText(input.description),
      kind,
      refreshIntervalHours,
      language,
      queryMode,
      queryOverride:
        queryMode === "manual" ? normalizeNullableText(input.queryOverride) : null,
      isEnabled: input.isEnabled ?? true,
      showOnDashboard: input.showOnDashboard ?? true,
      lastRefreshedAt: null,
      nextRefreshAt: new Date(),
      userId,
      sources: sources.length
        ? {
            create: sources.map((source) => ({
              sourceType: source.sourceType,
              noteId: source.noteId,
              folderId: source.folderId,
              includeChildren: source.includeChildren ?? true,
            })),
          }
        : undefined,
    },
  });

  await recordOperation({
    userId,
    entityType: "feed",
    entityId: feed.id,
    actionType: "create",
    payload: {
      kind,
      title: feed.title,
    },
  });

  await safeRefreshWorkspaceFeed(userId, feed.id);
  return feed;
}

export async function updateWorkspaceFeed(
  userId: string,
  feedId: string,
  input: UpdateWorkspaceFeedInput,
) {
  await assertOwnedFeed(userId, feedId);

  const nextQueryMode = input.queryMode
    ? normalizeFeedQueryMode(input.queryMode)
    : undefined;

  await db.workspaceFeed.update({
    where: { id: feedId },
    data: {
      ...(typeof input.title === "string" ? { title: input.title.trim() } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "description")
        ? { description: normalizeNullableText(input.description) }
        : {}),
      ...(typeof input.refreshIntervalHours === "number"
        ? {
            refreshIntervalHours: clampRefreshIntervalHours(
              input.refreshIntervalHours,
            ),
          }
        : {}),
      ...(input.language ? { language: normalizeFeedLanguage(input.language) } : {}),
      ...(nextQueryMode ? { queryMode: nextQueryMode } : {}),
      ...((nextQueryMode === "auto" || input.queryMode === "auto")
        ? { queryOverride: null }
        : Object.prototype.hasOwnProperty.call(input, "queryOverride")
          ? {
              queryOverride: normalizeNullableText(input.queryOverride),
            }
          : {}),
      ...(typeof input.isEnabled === "boolean" ? { isEnabled: input.isEnabled } : {}),
      ...(typeof input.showOnDashboard === "boolean"
        ? { showOnDashboard: input.showOnDashboard }
        : {}),
      nextRefreshAt: new Date(),
    },
  });

  await recordOperation({
    userId,
    entityType: "feed",
    entityId: feedId,
    actionType: "update",
    payload: input,
  });

  await safeRefreshWorkspaceFeed(userId, feedId);
}

export async function deleteWorkspaceFeed(userId: string, feedId: string) {
  await assertOwnedFeed(userId, feedId);

  await db.workspaceFeed.delete({
    where: { id: feedId },
  });

  await recordOperation({
    userId,
    entityType: "feed",
    entityId: feedId,
    actionType: "delete",
  });
}

export async function createFeedFromSource(
  userId: string,
  input: {
    kind: WorkspaceFeedKind;
    sourceType: "note" | "folder";
    sourceId: string;
  },
) {
  if (input.sourceType === "note") {
    const note = await assertOwnedNote(userId, input.sourceId);

    return createWorkspaceFeed(userId, {
      kind: input.kind,
      title:
        input.kind === "news"
          ? `${note.title} gündemi`
          : `${note.title} önerileri`,
      description:
        input.kind === "news"
          ? "Seçilen not etrafında güncel içerik akışı"
          : "Seçilen not etrafında düzen ve bağlantı önerileri",
      language: "mixed",
      refreshIntervalHours:
        input.kind === "news" ? NEWS_REFRESH_HOURS : SUGGESTION_REFRESH_HOURS,
      sources: [
        {
          sourceType: "note",
          noteId: note.id,
        },
      ],
    });
  }

  const folder = await assertOwnedFolder(userId, input.sourceId);

  return createWorkspaceFeed(userId, {
    kind: input.kind,
    title:
      input.kind === "news"
        ? `${folder.name} gündemi`
        : `${folder.name} önerileri`,
    description:
      input.kind === "news"
        ? "Seçilen klasör etrafında güncel içerik akışı"
        : "Seçilen klasör etrafında düzen önerileri",
    language: "mixed",
    refreshIntervalHours:
      input.kind === "news" ? NEWS_REFRESH_HOURS : SUGGESTION_REFRESH_HOURS,
    sources: [
      {
        sourceType: "folder",
        folderId: folder.id,
        includeChildren: true,
      },
    ],
  });
}

export async function setFeedSourceMembership(
  userId: string,
  input: {
    feedId: string;
    sourceType: "note" | "folder";
    sourceId: string;
    enabled: boolean;
  },
) {
  const feed = await assertOwnedFeed(userId, input.feedId);

  if (input.sourceType === "note") {
    await assertOwnedNote(userId, input.sourceId);
  } else {
    await assertOwnedFolder(userId, input.sourceId);
  }

  const existing = feed.sources.find((source) =>
    input.sourceType === "note"
      ? source.noteId === input.sourceId
      : source.folderId === input.sourceId,
  );

  if (input.enabled && !existing) {
    await db.workspaceFeedSource.create({
      data: {
        feedId: input.feedId,
        sourceType: input.sourceType,
        noteId: input.sourceType === "note" ? input.sourceId : null,
        folderId: input.sourceType === "folder" ? input.sourceId : null,
        includeChildren: true,
      },
    });
  }

  if (!input.enabled && existing) {
    await db.workspaceFeedSource.delete({ where: { id: existing.id } });
  }

  await db.workspaceFeed.update({
    where: { id: input.feedId },
    data: {
      nextRefreshAt: new Date(),
    },
  });

  await recordOperation({
    userId,
    entityType: "feed",
    entityId: input.feedId,
    actionType: input.enabled ? "attach-source" : "detach-source",
    payload: input,
  });

  await safeRefreshWorkspaceFeed(userId, input.feedId);
}

export async function refreshWorkspaceFeed(
  userId: string,
  feedId: string,
): Promise<RefreshWorkspaceFeedResult> {
  const feed = await db.workspaceFeed.findFirst({
    where: { id: feedId, userId },
    include: {
      sources: {
        include: {
          note: {
            select: {
              id: true,
              title: true,
            },
          },
          folder: {
            select: {
              id: true,
              name: true,
              parentId: true,
            },
          },
        },
      },
      items: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!feed) {
    throw new Error("Feed not found");
  }

  const now = new Date();
  const sourceContext = await loadFeedSourceContext(userId, feed.sources);

  let nextItems: Array<{
    itemType: string;
    title: string;
    summary: string | null;
    whyRelevant: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    sourceKey: string | null;
    publishedAt: Date | null;
    payload: Record<string, unknown>;
  }> = [];

  if (feed.kind === "news") {
    const profile = buildNewsQueryPreview({
      manualQuery: feed.queryMode === "manual" ? feed.queryOverride : null,
      titles: sourceContext.sourceNotes.map((note) => note.title),
      tags: sourceContext.sourceNotes.flatMap((note) => note.tags),
      folderNames: sourceContext.sourceFolders.map((folder) => folder.name),
    });

    const candidates = profile.query
      ? await loadTrustedNewsCandidates({
          language: normalizeFeedLanguage(feed.language),
          queryProfile: profile,
          sourceLabels: sourceContext.sourceLabels,
          limit: DEFAULT_ITEM_LIMIT,
        })
      : [];

    nextItems = candidates.map((candidate) => ({
      itemType: "article",
      title: candidate.title,
      summary: candidate.summary,
      whyRelevant: candidate.whyRelevant,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      sourceKey: candidate.sourceKey,
      publishedAt: candidate.publishedAt,
      payload: {
        score: candidate.score,
        query: profile.query,
      },
    }));
  } else {
    const allNotes = await loadWorkspaceNoteCorpus(userId);
    const candidates = buildSuggestionCandidates({
      sourceNotes: sourceContext.sourceNotes,
      sourceFolders: sourceContext.sourceFolders,
      allNotes,
      folderDescendantIds: sourceContext.folderDescendantIds,
      limit: DEFAULT_ITEM_LIMIT,
    });

    nextItems = candidates.map((candidate) => ({
      itemType: candidate.itemType,
      title: candidate.title,
      summary: candidate.summary,
      whyRelevant: candidate.whyRelevant,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      sourceKey: candidate.sourceKey,
      publishedAt: now,
      payload: candidate.payload,
    }));
  }

  const shouldReplaceItems =
    feed.kind === "suggestion" ||
    nextItems.length > 0 ||
    (feed.kind === "news" &&
      sourceContext.sourceNotes.length === 0 &&
      sourceContext.sourceFolders.length === 0 &&
      !normalizeNullableText(feed.queryOverride));

  if (shouldReplaceItems) {
    await db.workspaceFeedItem.deleteMany({
      where: { feedId },
    });

    if (nextItems.length > 0) {
      await db.workspaceFeedItem.createMany({
        data: nextItems.map((item, index) => ({
          feedId,
          itemType: item.itemType,
          title: item.title,
          summary: item.summary,
          whyRelevant: item.whyRelevant,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          sourceKey: item.sourceKey,
          publishedAt: item.publishedAt,
          payload: item.payload as object,
          position: index,
        })),
      });
    }
  }

  const refreshedAt = new Date();
  await db.workspaceFeed.update({
    where: { id: feedId },
    data: {
      lastRefreshedAt: refreshedAt,
      nextRefreshAt: addHours(refreshedAt, feed.refreshIntervalHours),
    },
  });

  await recordOperation({
    userId,
    entityType: "feed",
    entityId: feedId,
    actionType: "refresh",
    payload: {
      itemCount: nextItems.length,
    },
  });

  return {
    feedId,
    refreshedAt,
    itemCount: shouldReplaceItems ? nextItems.length : feed.items.length,
  };
}

export async function refreshDueFeedsForUser(
  userId: string,
  kind?: WorkspaceFeedKind,
) {
  const now = new Date();
  const feeds = await db.workspaceFeed.findMany({
    where: {
      userId,
      isEnabled: true,
      ...(kind ? { kind } : {}),
      OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }],
    },
    select: {
      id: true,
    },
    orderBy: [{ nextRefreshAt: "asc" }],
    take: 4,
  });

  for (const feed of feeds) {
    await safeRefreshWorkspaceFeed(userId, feed.id);
  }
}

export async function refreshDueFeedsGlobally(limit = 12) {
  const now = new Date();
  const feeds = await db.workspaceFeed.findMany({
    where: {
      isEnabled: true,
      OR: [{ nextRefreshAt: null }, { nextRefreshAt: { lte: now } }],
    },
    select: {
      id: true,
      userId: true,
    },
    orderBy: [{ nextRefreshAt: "asc" }],
    take: limit,
  });

  const results: RefreshWorkspaceFeedResult[] = [];

  for (const feed of feeds) {
    const result = await safeRefreshWorkspaceFeed(feed.userId, feed.id);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

async function getFeedAssignments(
  userId: string,
  input: { sourceType: "note" | "folder"; sourceId: string },
): Promise<FeedAssignmentSummary[]> {
  const feeds = await db.workspaceFeed.findMany({
    where: { userId },
    include: {
      sources: true,
      _count: {
        select: {
          items: true,
        },
      },
    },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
  });

  return feeds.map((feed) => ({
    id: feed.id,
    title: feed.title,
    kind: normalizeFeedKind(feed.kind),
    isSelected: feed.sources.some((source) =>
      input.sourceType === "note"
        ? source.noteId === input.sourceId
        : source.folderId === input.sourceId,
    ),
    refreshIntervalHours: feed.refreshIntervalHours,
    itemCount: feed._count.items,
  }));
}

async function normalizeFeedSources(
  userId: string,
  sources: WorkspaceFeedSourceInput[],
) {
  const normalized: WorkspaceFeedSourceInput[] = [];

  for (const source of sources) {
    if (source.sourceType === "note" && source.noteId) {
      await assertOwnedNote(userId, source.noteId);
      normalized.push({
        sourceType: "note",
        noteId: source.noteId,
        includeChildren: false,
      });
      continue;
    }

    if (source.sourceType === "folder" && source.folderId) {
      await assertOwnedFolder(userId, source.folderId);
      normalized.push({
        sourceType: "folder",
        folderId: source.folderId,
        includeChildren: source.includeChildren ?? true,
      });
    }
  }

  return dedupeSources(normalized);
}

async function loadFeedSourceContext(
  userId: string,
  sources: Array<{
    id: string;
    sourceType: string;
    noteId: string | null;
    folderId: string | null;
    includeChildren: boolean;
    note?: { id: string; title: string } | null;
    folder?: { id: string; name: string; parentId: string | null } | null;
  }>,
) {
  const folderTree = await db.folder.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      parentId: true,
    },
    orderBy: [{ name: "asc" }],
  });
  const folderDescendantIds = buildFolderDescendantMap(folderTree);

  const noteIds = new Set<string>();
  const folderIds = new Set<string>();
  const sourceLabels: string[] = [];
  const sourceFolders: SuggestionFolderContext[] = [];

  for (const source of sources) {
    if (source.noteId) {
      noteIds.add(source.noteId);
      if (source.note?.title) {
        sourceLabels.push(source.note.title);
      }
    }

    if (source.folderId) {
      const descendants = source.includeChildren
        ? folderDescendantIds.get(source.folderId) ?? new Set<string>([source.folderId])
        : new Set<string>([source.folderId]);

      for (const folderId of descendants) {
        folderIds.add(folderId);
      }

      if (source.folder?.name) {
        sourceLabels.push(source.folder.name);
        sourceFolders.push({
          id: source.folder.id,
          name: source.folder.name,
        });
      }
    }
  }

  const sourceNotes = noteIds.size === 0 && folderIds.size === 0
    ? []
    : await db.note.findMany({
        where: {
          userId,
          isArchived: false,
          OR: [
            noteIds.size > 0 ? { id: { in: Array.from(noteIds) } } : undefined,
            folderIds.size > 0 ? { folderId: { in: Array.from(folderIds) } } : undefined,
          ].filter(Boolean) as Array<Record<string, unknown>>,
        },
        select: {
          id: true,
          title: true,
          folderId: true,
          folder: {
            select: {
              id: true,
              name: true,
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });

  return {
    sourceLabels: Array.from(new Set(sourceLabels)),
    sourceFolders,
    sourceNotes: sourceNotes.map<SuggestionNoteContext>((note) => ({
      id: note.id,
      title: note.title,
      folderId: note.folderId,
      folderName: note.folder?.name ?? null,
      tags: note.tags.map((tag) => tag.tag.name),
    })),
    folderDescendantIds,
  };
}

async function loadWorkspaceNoteCorpus(userId: string) {
  const notes = await db.note.findMany({
    where: { userId, isArchived: false },
    select: {
      id: true,
      title: true,
      folderId: true,
      folder: {
        select: {
          name: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return notes.map<SuggestionNoteContext>((note) => ({
    id: note.id,
    title: note.title,
    folderId: note.folderId,
    folderName: note.folder?.name ?? null,
    tags: note.tags.map((tag) => tag.tag.name),
  }));
}

async function assertOwnedFeed(userId: string, feedId: string) {
  const feed = await db.workspaceFeed.findFirst({
    where: { id: feedId, userId },
    include: {
      sources: true,
    },
  });

  if (!feed) {
    throw new Error("Feed not found");
  }

  return feed;
}

async function assertOwnedNote(userId: string, noteId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: {
      id: true,
      title: true,
    },
  });

  if (!note) {
    throw new Error("Note not found");
  }

  return note;
}

async function assertOwnedFolder(userId: string, folderId: string) {
  const folder = await db.folder.findFirst({
    where: { id: folderId, userId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!folder) {
    throw new Error("Folder not found");
  }

  return folder;
}

function buildFolderDescendantMap(
  folders: Array<{ id: string; name: string; parentId: string | null }>,
) {
  const childrenByParent = new Map<string | null, string[]>();

  for (const folder of folders) {
    const children = childrenByParent.get(folder.parentId) ?? [];
    children.push(folder.id);
    childrenByParent.set(folder.parentId, children);
  }

  const descendants = new Map<string, Set<string>>();

  const visit = (folderId: string): Set<string> => {
    const existing = descendants.get(folderId);
    if (existing) {
      return existing;
    }

    const next = new Set<string>([folderId]);
    const children = childrenByParent.get(folderId) ?? [];

    for (const childId of children) {
      const childDescendants = visit(childId);
      for (const descendantId of childDescendants) {
        next.add(descendantId);
      }
    }

    descendants.set(folderId, next);
    return next;
  };

  for (const folder of folders) {
    visit(folder.id);
  }

  return descendants;
}

function mapFeedSummary(feed: {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  refreshIntervalHours: number;
  language: string;
  queryMode: string;
  queryOverride: string | null;
  isEnabled: boolean;
  showOnDashboard: boolean;
  lastRefreshedAt: Date | null;
  nextRefreshAt: Date | null;
  sources: Array<{
    id: string;
    noteId: string | null;
    folderId: string | null;
    note?: { id: string; title: string } | null;
    folder?: { id: string; name: string } | null;
  }>;
  items: Array<{
    id: string;
    itemType: string;
    title: string;
    summary: string | null;
    whyRelevant: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    publishedAt: Date | null;
    position: number;
    payload: unknown;
  }>;
  _count: {
    items: number;
  };
}): WorkspaceFeedSummary {
  return {
    id: feed.id,
    title: feed.title,
    description: feed.description,
    kind: normalizeFeedKind(feed.kind),
    refreshIntervalHours: feed.refreshIntervalHours,
    language: normalizeFeedLanguage(feed.language),
    queryMode: normalizeFeedQueryMode(feed.queryMode),
    queryOverride: feed.queryOverride,
    isEnabled: feed.isEnabled,
    showOnDashboard: feed.showOnDashboard,
    lastRefreshedAt: feed.lastRefreshedAt,
    nextRefreshAt: feed.nextRefreshAt,
    sourceCount: feed.sources.length,
    sources: feed.sources
      .map((source) => mapFeedSourceBadge(source))
      .filter((source): source is FeedSourceBadge => Boolean(source)),
    itemCount: feed._count.items,
    items: feed.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      title: item.title,
      summary: item.summary,
      whyRelevant: item.whyRelevant,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
      position: item.position,
      payload: (item.payload ?? {}) as Record<string, unknown>,
    })),
  };
}

function mapFeedSourceBadge(source: {
  id: string;
  noteId: string | null;
  folderId: string | null;
  note?: { id: string; title: string } | null;
  folder?: { id: string; name: string } | null;
}) {
  if (source.noteId && source.note) {
    return {
      id: source.id,
      sourceId: source.note.id,
      sourceType: "note",
      label: source.note.title,
      href: `/notes/${source.note.id}`,
    } satisfies FeedSourceBadge;
  }

  if (source.folderId && source.folder) {
    return {
      id: source.id,
      sourceId: source.folder.id,
      sourceType: "folder",
      label: source.folder.name,
      href: `/folders/${source.folder.id}`,
    } satisfies FeedSourceBadge;
  }

  return null;
}

async function safeRefreshWorkspaceFeed(userId: string, feedId: string) {
  try {
    return await refreshWorkspaceFeed(userId, feedId);
  } catch (error) {
    console.error("Failed to refresh workspace feed", { userId, feedId, error });
    return null;
  }
}

function normalizeFeedKind(kind: string): WorkspaceFeedKind {
  return WORKSPACE_FEED_KINDS.includes(kind as WorkspaceFeedKind)
    ? (kind as WorkspaceFeedKind)
    : "news";
}

function normalizeFeedLanguage(language: string | undefined | null) {
  return WORKSPACE_FEED_LANGUAGES.includes(language as (typeof WORKSPACE_FEED_LANGUAGES)[number])
    ? (language as (typeof WORKSPACE_FEED_LANGUAGES)[number])
    : "mixed";
}

function normalizeFeedQueryMode(queryMode: string | undefined | null) {
  return WORKSPACE_FEED_QUERY_MODES.includes(queryMode as (typeof WORKSPACE_FEED_QUERY_MODES)[number])
    ? (queryMode as (typeof WORKSPACE_FEED_QUERY_MODES)[number])
    : "auto";
}

function clampRefreshIntervalHours(value: number) {
  return Math.min(168, Math.max(1, Math.round(value)));
}

function normalizeNullableText(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function dedupeSources(sources: WorkspaceFeedSourceInput[]) {
  const byKey = new Map<string, WorkspaceFeedSourceInput>();

  for (const source of sources) {
    const key = source.sourceType === "note"
      ? `note:${source.noteId}`
      : `folder:${source.folderId}`;
    byKey.set(key, source);
  }

  return Array.from(byKey.values());
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
