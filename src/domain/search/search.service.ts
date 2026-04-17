import { db } from "@/lib/db";

const DEFAULT_LIMIT = 40;
const MAX_SCAN_NOTES = 320;
const MAX_BLOCKS_PER_NOTE = 180;
const MAX_QUERY_LENGTH = 220;

export type WorkspaceSearchMode = "recent" | "hybrid" | "regex";
export type WorkspaceSearchReasonType =
  | "title"
  | "folder"
  | "tag"
  | "body"
  | "fuzzy"
  | "regex";

export interface WorkspaceSearchReason {
  type: WorkspaceSearchReasonType;
  label: string;
}

export interface WorkspaceSearchNoteHit {
  id: string;
  title: string;
  slug: string | null;
  folderId: string | null;
  folderPath: string | null;
  tags: string[];
  isPinned: boolean;
  updatedAt: Date;
  score: number;
  snippet: string;
  highlights: string[];
  reasons: WorkspaceSearchReason[];
  mode: Exclude<WorkspaceSearchMode, "recent"> | "recent";
}

export interface WorkspaceNoteSearchResult {
  query: string;
  mode: WorkspaceSearchMode;
  scannedNotes: number;
  regexError: string | null;
  hits: WorkspaceSearchNoteHit[];
}

interface IndexedNote {
  id: string;
  title: string;
  titleNormalized: string;
  slug: string | null;
  folderId: string | null;
  folderPath: string | null;
  folderPathNormalized: string;
  tagNames: string[];
  tagNamesNormalized: string[];
  tagsJoinedNormalized: string;
  isPinned: boolean;
  updatedAt: Date;
  bodyPlain: string;
  bodyNormalized: string;
}

export async function searchWorkspaceNotes(
  userId: string,
  query: string,
  options?: {
    limit?: number;
  },
): Promise<WorkspaceNoteSearchResult> {
  const trimmedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
  const limit = Math.max(1, Math.min(options?.limit ?? DEFAULT_LIMIT, 120));

  const [noteRows, folders] = await Promise.all([
    db.note.findMany({
      where: {
        userId,
        isArchived: false,
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      take: MAX_SCAN_NOTES,
      select: {
        id: true,
        title: true,
        slug: true,
        folderId: true,
        isPinned: true,
        updatedAt: true,
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        blocks: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          take: MAX_BLOCKS_PER_NOTE,
          select: {
            content: true,
          },
        },
      },
    }),
    db.folder.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    }),
  ]);

  const folderPathById = buildFolderPathMap(folders);
  const indexedNotes: IndexedNote[] = noteRows.map((note) => {
    const bodyPlain = note.blocks
      .map((block) => extractTextFromJson(block.content))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const folderPath = note.folderId ? folderPathById.get(note.folderId) ?? null : null;
    const tagNames = note.tags.map((noteTag) => noteTag.tag.name).sort((a, b) =>
      a.localeCompare(b, "tr"),
    );
    const tagNamesNormalized = tagNames.map(normalizeForSearch);

    return {
      id: note.id,
      title: note.title,
      titleNormalized: normalizeForSearch(note.title),
      slug: note.slug,
      folderId: note.folderId,
      folderPath,
      folderPathNormalized: normalizeForSearch(folderPath ?? ""),
      tagNames,
      tagNamesNormalized,
      tagsJoinedNormalized: tagNamesNormalized.join(" "),
      isPinned: note.isPinned,
      updatedAt: note.updatedAt,
      bodyPlain,
      bodyNormalized: normalizeForSearch(bodyPlain),
    };
  });

  if (!trimmedQuery) {
    return {
      query: "",
      mode: "recent",
      scannedNotes: indexedNotes.length,
      regexError: null,
      hits: indexedNotes.slice(0, limit).map((note, index) => ({
        id: note.id,
        title: note.title,
        slug: note.slug,
        folderId: note.folderId,
        folderPath: note.folderPath,
        tags: note.tagNames,
        isPinned: note.isPinned,
        updatedAt: note.updatedAt,
        score: limit - index,
        snippet: buildSnippet({
          body: note.bodyPlain,
          title: note.title,
          folderPath: note.folderPath,
          tags: note.tagNames,
          query: note.title,
          tokens: [],
          regex: null,
        }),
        highlights: note.tagNames.slice(0, 3),
        reasons: [
          {
            type: "title",
            label: "Recent",
          },
        ],
        mode: "recent",
      })),
    };
  }

  const regexParsing = parseRegexQuery(trimmedQuery);

  if (regexParsing.isRegex) {
    if (!regexParsing.regex) {
      return {
        query: trimmedQuery,
        mode: "regex",
        scannedNotes: indexedNotes.length,
        regexError: regexParsing.error,
        hits: [],
      };
    }

    const regexHits = indexedNotes
      .map((note) => scoreRegexHit(note, regexParsing.regex as RegExp))
      .filter((hit): hit is WorkspaceSearchNoteHit => hit !== null)
      .sort(sortByScoreThenDate)
      .slice(0, limit);

    return {
      query: trimmedQuery,
      mode: "regex",
      scannedNotes: indexedNotes.length,
      regexError: null,
      hits: regexHits,
    };
  }

  const normalizedQuery = normalizeForSearch(trimmedQuery);
  const tokens = tokenize(normalizedQuery);

  const hybridHits = indexedNotes
    .map((note) => scoreHybridHit(note, normalizedQuery, tokens))
    .filter((hit): hit is WorkspaceSearchNoteHit => hit !== null)
    .sort(sortByScoreThenDate)
    .slice(0, limit);

  return {
    query: trimmedQuery,
    mode: "hybrid",
    scannedNotes: indexedNotes.length,
    regexError: null,
    hits: hybridHits,
  };
}

function scoreRegexHit(note: IndexedNote, regex: RegExp): WorkspaceSearchNoteHit | null {
  const titleMatches = collectRegexMatches(note.title, regex, 6);
  const folderMatches = collectRegexMatches(note.folderPath ?? "", regex, 4);
  const tagMatches = note.tagNames.flatMap((tag) => collectRegexMatches(tag, regex, 2)).slice(0, 6);
  const bodyMatches = collectRegexMatches(note.bodyPlain, regex, 10);

  if (
    titleMatches.length === 0 &&
    folderMatches.length === 0 &&
    tagMatches.length === 0 &&
    bodyMatches.length === 0
  ) {
    return null;
  }

  const reasons: WorkspaceSearchReason[] = [];

  if (titleMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex title" });
  }

  if (folderMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex folder" });
  }

  if (tagMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex tags" });
  }

  if (bodyMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex body" });
  }

  const score =
    titleMatches.length * 150 +
    folderMatches.length * 80 +
    tagMatches.length * 72 +
    bodyMatches.length * 24 +
    getRecencyBoost(note.updatedAt) +
    (note.isPinned ? 6 : 0);

  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    folderId: note.folderId,
    folderPath: note.folderPath,
    tags: note.tagNames,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
    score,
    snippet: buildSnippet({
      body: note.bodyPlain,
      title: note.title,
      folderPath: note.folderPath,
      tags: note.tagNames,
      query: note.title,
      tokens: [],
      regex,
    }),
    highlights: [...titleMatches, ...folderMatches, ...tagMatches, ...bodyMatches].slice(0, 6),
    reasons,
    mode: "regex",
  };
}

function scoreHybridHit(
  note: IndexedNote,
  normalizedQuery: string,
  tokens: string[],
): WorkspaceSearchNoteHit | null {
  let score = 0;
  const reasons: WorkspaceSearchReason[] = [];
  const highlights = new Set<string>();

  score += scoreTextField({
    label: "Title exact",
    reasonType: "title",
    valueNormalized: note.titleNormalized,
    queryNormalized: normalizedQuery,
    tokens,
    exact: 260,
    startsWith: 180,
    contains: 125,
    tokenHit: 38,
    fuzzyMin: 0.36,
    fuzzyWeight: 95,
    reasons,
  });

  score += scoreTextField({
    label: "Folder match",
    reasonType: "folder",
    valueNormalized: note.folderPathNormalized,
    queryNormalized: normalizedQuery,
    tokens,
    exact: 190,
    startsWith: 92,
    contains: 76,
    tokenHit: 20,
    fuzzyMin: 0.42,
    fuzzyWeight: 54,
    reasons,
  });

  score += scoreTagField({
    note,
    queryNormalized: normalizedQuery,
    tokens,
    reasons,
    highlights,
  });

  score += scoreBodyField({
    note,
    queryNormalized: normalizedQuery,
    tokens,
    reasons,
  });

  const semanticSignals = computeSemanticSignals(note, normalizedQuery, tokens);
  score += semanticSignals.score;

  if (semanticSignals.score > 0) {
    reasons.push({
      type: "fuzzy",
      label: semanticSignals.label,
    });
  }

  if (note.isPinned) {
    score += 6;
  }

  score += getRecencyBoost(note.updatedAt);

  const hasStrongMatch = reasons.some((reason) => reason.type !== "fuzzy") || score >= 68;

  if (!hasStrongMatch) {
    return null;
  }

  for (const token of tokens) {
    if (
      note.titleNormalized.includes(token) ||
      note.folderPathNormalized.includes(token) ||
      note.tagsJoinedNormalized.includes(token)
    ) {
      highlights.add(token);
    }
  }

  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    folderId: note.folderId,
    folderPath: note.folderPath,
    tags: note.tagNames,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
    score,
    snippet: buildSnippet({
      body: note.bodyPlain,
      title: note.title,
      folderPath: note.folderPath,
      tags: note.tagNames,
      query: normalizedQuery,
      tokens,
      regex: null,
    }),
    highlights: Array.from(highlights).slice(0, 6),
    reasons: dedupeReasons(reasons).slice(0, 4),
    mode: "hybrid",
  };
}

function scoreTextField({
  label,
  reasonType,
  valueNormalized,
  queryNormalized,
  tokens,
  exact,
  startsWith,
  contains,
  tokenHit,
  fuzzyMin,
  fuzzyWeight,
  reasons,
}: {
  label: string;
  reasonType: WorkspaceSearchReasonType;
  valueNormalized: string;
  queryNormalized: string;
  tokens: string[];
  exact: number;
  startsWith: number;
  contains: number;
  tokenHit: number;
  fuzzyMin: number;
  fuzzyWeight: number;
  reasons: WorkspaceSearchReason[];
}) {
  if (!valueNormalized) {
    return 0;
  }

  let score = 0;

  if (valueNormalized === queryNormalized) {
    score += exact;
    reasons.push({ type: reasonType, label });
  } else if (valueNormalized.startsWith(queryNormalized)) {
    score += startsWith;
    reasons.push({ type: reasonType, label });
  } else if (valueNormalized.includes(queryNormalized)) {
    score += contains;
    reasons.push({ type: reasonType, label });
  }

  let tokenMatches = 0;

  for (const token of tokens) {
    if (valueNormalized.includes(token)) {
      tokenMatches += 1;
      score += tokenHit;
    }
  }

  if (tokenMatches >= Math.max(1, Math.ceil(tokens.length / 2)) && tokens.length > 0) {
    reasons.push({ type: reasonType, label });
  }

  const fuzzyScore = Math.max(
    diceCoefficient(queryNormalized, valueNormalized),
    tokenSetSimilarity(tokens, tokenize(valueNormalized)),
  );

  if (fuzzyScore >= fuzzyMin) {
    score += Math.round(fuzzyScore * fuzzyWeight);
  }

  return score;
}

function scoreTagField({
  note,
  queryNormalized,
  tokens,
  reasons,
  highlights,
}: {
  note: IndexedNote;
  queryNormalized: string;
  tokens: string[];
  reasons: WorkspaceSearchReason[];
  highlights: Set<string>;
}) {
  let score = 0;
  let matchedTagCount = 0;

  for (let index = 0; index < note.tagNamesNormalized.length; index += 1) {
    const tagNormalized = note.tagNamesNormalized[index] ?? "";
    const rawTag = note.tagNames[index] ?? "";

    if (!tagNormalized) {
      continue;
    }

    if (tagNormalized === queryNormalized) {
      score += 200;
      matchedTagCount += 1;
      highlights.add(rawTag);
      continue;
    }

    if (tagNormalized.startsWith(queryNormalized)) {
      score += 118;
      matchedTagCount += 1;
      highlights.add(rawTag);
      continue;
    }

    if (tagNormalized.includes(queryNormalized)) {
      score += 88;
      matchedTagCount += 1;
      highlights.add(rawTag);
      continue;
    }

    const tokenOverlap = tokens.filter((token) => tagNormalized.includes(token)).length;

    if (tokenOverlap > 0) {
      score += tokenOverlap * 34;
      matchedTagCount += 1;
      highlights.add(rawTag);
      continue;
    }

    const fuzzyScore = Math.max(
      diceCoefficient(queryNormalized, tagNormalized),
      tokenSetSimilarity(tokens, tokenize(tagNormalized)),
    );

    if (fuzzyScore >= 0.52) {
      score += Math.round(fuzzyScore * 74);
      matchedTagCount += 1;
      highlights.add(rawTag);
    }
  }

  if (matchedTagCount > 0) {
    reasons.push({ type: "tag", label: "Tag match" });
  }

  return score;
}

function scoreBodyField({
  note,
  queryNormalized,
  tokens,
  reasons,
}: {
  note: IndexedNote;
  queryNormalized: string;
  tokens: string[];
  reasons: WorkspaceSearchReason[];
}) {
  if (!note.bodyNormalized) {
    return 0;
  }

  let score = 0;
  let bodyMatched = false;

  if (note.bodyNormalized.includes(queryNormalized)) {
    score += 70;
    bodyMatched = true;
  }

  let tokenHits = 0;

  for (const token of tokens) {
    if (note.bodyNormalized.includes(token)) {
      tokenHits += 1;
      score += 12;
    }
  }

  if (tokenHits >= Math.max(2, Math.ceil(tokens.length / 2))) {
    bodyMatched = true;
  }

  const limitedBody = note.bodyNormalized.slice(0, 1200);
  const fuzzyScore = Math.max(
    diceCoefficient(queryNormalized, limitedBody),
    tokenSetSimilarity(tokens, tokenize(limitedBody).slice(0, 80)),
  );

  if (fuzzyScore >= 0.58) {
    score += Math.round(fuzzyScore * 26);
  }

  if (bodyMatched) {
    reasons.push({ type: "body", label: "Body match" });
  }

  return score;
}

function computeSemanticSignals(
  note: IndexedNote,
  normalizedQuery: string,
  tokens: string[],
) {
  const titleTokens = tokenize(note.titleNormalized);
  const folderTokens = tokenize(note.folderPathNormalized);
  const tagTokens = note.tagNamesNormalized.flatMap((tag) => tokenize(tag));
  const topBodyTokens = tokenize(note.bodyNormalized).slice(0, 60);

  const titleSimilarity = tokenSetSimilarity(tokens, titleTokens);
  const folderSimilarity = tokenSetSimilarity(tokens, folderTokens);
  const tagSimilarity = tokenSetSimilarity(tokens, tagTokens);
  const bodySimilarity = tokenSetSimilarity(tokens, topBodyTokens);
  const phraseSimilarity = Math.max(
    diceCoefficient(normalizedQuery, note.titleNormalized),
    diceCoefficient(normalizedQuery, note.folderPathNormalized),
  );

  const score =
    Math.round(titleSimilarity * 72) +
    Math.round(folderSimilarity * 34) +
    Math.round(tagSimilarity * 62) +
    Math.round(bodySimilarity * 18) +
    Math.round(phraseSimilarity * 36);

  if (score < 26) {
    return {
      score: 0,
      label: "",
    };
  }

  if (tagSimilarity >= titleSimilarity && tagSimilarity >= folderSimilarity) {
    return {
      score,
      label: "Tag fuzzy",
    };
  }

  if (folderSimilarity > titleSimilarity) {
    return {
      score,
      label: "Folder fuzzy",
    };
  }

  return {
    score,
    label: "Fuzzy match",
  };
}

function sortByScoreThenDate(
  left: WorkspaceSearchNoteHit,
  right: WorkspaceSearchNoteHit,
) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return right.updatedAt.getTime() - left.updatedAt.getTime();
}

function buildSnippet({
  body,
  title,
  folderPath,
  tags,
  query,
  tokens,
  regex,
}: {
  body: string;
  title: string;
  folderPath: string | null;
  tags: string[];
  query: string;
  tokens: string[];
  regex: RegExp | null;
}) {
  const sourceCandidates = [
    body.trim(),
    folderPath?.trim() ?? "",
    tags.join(" · ").trim(),
    title,
  ].filter(Boolean);
  const source = sourceCandidates[0] ?? title;

  if (!source) {
    return "İçerik bulunamadı.";
  }

  let index = 0;

  if (regex) {
    const regexWithGlobal = cloneRegex(regex, true);
    const match = regexWithGlobal.exec(source);
    index = match?.index ?? 0;
  } else {
    const directMatch = findCaseInsensitiveIndex(source, query);

    if (directMatch >= 0) {
      index = directMatch;
    } else {
      const tokenMatch = tokens
        .map((token) => findCaseInsensitiveIndex(source, token))
        .find((value) => value >= 0);

      index = tokenMatch ?? 0;
    }
  }

  const start = Math.max(0, index - 84);
  const end = Math.min(source.length, index + 160);
  const snippet = source.slice(start, end).replace(/\s+/g, " ").trim();

  if (!snippet) {
    return source.slice(0, 140);
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < source.length ? "…" : "";

  return `${prefix}${snippet}${suffix}`;
}

function parseRegexQuery(query: string): {
  isRegex: boolean;
  regex: RegExp | null;
  error: string | null;
} {
  const trimmed = query.trim();

  if (trimmed.startsWith("re:") || trimmed.startsWith("rx:")) {
    const pattern = trimmed.slice(3).trim();

    if (!pattern) {
      return {
        isRegex: true,
        regex: null,
        error: "Regex deseni boş olamaz.",
      };
    }

    try {
      return {
        isRegex: true,
        regex: new RegExp(pattern, "i"),
        error: null,
      };
    } catch {
      return {
        isRegex: true,
        regex: null,
        error: "Regex deseni geçersiz.",
      };
    }
  }

  const literalRegexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/i);

  if (!literalRegexMatch) {
    return {
      isRegex: false,
      regex: null,
      error: null,
    };
  }

  const [, pattern, flags = ""] = literalRegexMatch;

  try {
    return {
      isRegex: true,
      regex: new RegExp(pattern, flags || "i"),
      error: null,
    };
  } catch {
    return {
      isRegex: true,
      regex: null,
      error: "Regex bayrakları veya deseni geçersiz.",
    };
  }
}

function collectRegexMatches(value: string, regex: RegExp, cap: number) {
  const matches: string[] = [];

  if (!value) {
    return matches;
  }

  const scanner = cloneRegex(regex, true);
  let guard = 0;

  while (matches.length < cap && guard < 80) {
    guard += 1;
    const next = scanner.exec(value);

    if (!next) {
      break;
    }

    const token = next[0]?.trim();

    if (token) {
      matches.push(token);
    }

    if (scanner.lastIndex === next.index) {
      scanner.lastIndex += 1;
    }
  }

  return matches;
}

function cloneRegex(regex: RegExp, forceGlobal: boolean) {
  const flags = forceGlobal
    ? regex.flags.includes("g")
      ? regex.flags
      : `${regex.flags}g`
    : regex.flags;

  return new RegExp(regex.source, flags);
}

function buildFolderPathMap(
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }>,
) {
  const folderById = new Map(
    folders.map((folder) => [
      folder.id,
      {
        ...folder,
        path: "",
      },
    ]),
  );

  const resolve = (folderId: string): string => {
    const current = folderById.get(folderId);

    if (!current) {
      return "";
    }

    if (current.path) {
      return current.path;
    }

    const parentPath = current.parentId ? resolve(current.parentId) : "";
    current.path = parentPath ? `${parentPath} / ${current.name}` : current.name;
    return current.path;
  };

  for (const folder of folders) {
    resolve(folder.id);
  }

  return new Map(
    Array.from(folderById.entries()).map(([folderId, folder]) => [folderId, folder.path]),
  );
}

function dedupeReasons(reasons: WorkspaceSearchReason[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.type}:${reason.label}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractTextFromJson(value: unknown): string {
  const segments: string[] = [];

  const visit = (node: unknown) => {
    if (node == null) {
      return;
    }

    if (typeof node === "string") {
      segments.push(node);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;

    if (typeof record.text === "string") {
      segments.push(record.text);
    }

    if (record.content) {
      visit(record.content);
    }

    if (!record.content) {
      for (const [key, child] of Object.entries(record)) {
        if (key === "text" || key === "type") {
          continue;
        }

        if (typeof child === "object") {
          visit(child);
        }
      }
    }
  };

  visit(value);

  return segments
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized: string) {
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1),
    ),
  );
}

function normalizeForSearch(value: string) {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCaseInsensitiveIndex(source: string, needle: string) {
  const normalizedNeedle = needle.trim();

  if (!normalizedNeedle) {
    return -1;
  }

  return source
    .toLocaleLowerCase("tr")
    .indexOf(normalizedNeedle.toLocaleLowerCase("tr"));
}

function getRecencyBoost(updatedAt: Date) {
  const ageInDays = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (ageInDays < 1) {
    return 15;
  }

  if (ageInDays < 7) {
    return 10;
  }

  if (ageInDays < 30) {
    return 6;
  }

  return 2;
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);

  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

  const rightCounts = new Map<string, number>();

  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;

  for (const bigram of leftBigrams) {
    const remaining = rightCounts.get(bigram) ?? 0;

    if (remaining > 0) {
      intersection += 1;
      rightCounts.set(bigram, remaining - 1);
    }
  }

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}

function tokenSetSimilarity(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftSet.size, rightSet.size);
}

function buildBigrams(input: string) {
  const cleaned = input.replace(/\s+/g, " ").trim();

  if (cleaned.length < 2) {
    return [];
  }

  const grams: string[] = [];

  for (let index = 0; index < cleaned.length - 1; index += 1) {
    grams.push(cleaned.slice(index, index + 2));
  }

  return grams;
}
