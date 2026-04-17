import { db } from "@/lib/db";

const DEFAULT_LIMIT = 40;
const MAX_SCAN_NOTES = 320;
const MAX_BLOCKS_PER_NOTE = 180;
const MAX_QUERY_LENGTH = 220;

export type WorkspaceSearchMode = "recent" | "hybrid" | "regex";

export interface WorkspaceSearchNoteHit {
  id: string;
  title: string;
  slug: string | null;
  folderId: string | null;
  isPinned: boolean;
  updatedAt: Date;
  score: number;
  snippet: string;
  highlights: string[];
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

  const noteRows = await db.note.findMany({
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
      blocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        take: MAX_BLOCKS_PER_NOTE,
        select: {
          content: true,
        },
      },
    },
  });

  const indexedNotes: IndexedNote[] = noteRows.map((note) => {
    const bodyPlain = note.blocks
      .map((block) => extractTextFromJson(block.content))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      id: note.id,
      title: note.title,
      titleNormalized: normalizeForSearch(note.title),
      slug: note.slug,
      folderId: note.folderId,
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
        isPinned: note.isPinned,
        updatedAt: note.updatedAt,
        score: limit - index,
        snippet: buildSnippet({
          body: note.bodyPlain,
          title: note.title,
          query: note.title,
          tokens: [],
          regex: null,
        }),
        highlights: [],
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
  const bodyMatches = collectRegexMatches(note.bodyPlain, regex, 10);

  if (titleMatches.length === 0 && bodyMatches.length === 0) {
    return null;
  }

  const score =
    titleMatches.length * 130 +
    bodyMatches.length * 26 +
    getRecencyBoost(note.updatedAt) +
    (note.isPinned ? 6 : 0);

  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    folderId: note.folderId,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
    score,
    snippet: buildSnippet({
      body: note.bodyPlain,
      title: note.title,
      query: note.title,
      tokens: [],
      regex,
    }),
    highlights: [...titleMatches, ...bodyMatches].slice(0, 5),
    mode: "regex",
  };
}

function scoreHybridHit(
  note: IndexedNote,
  normalizedQuery: string,
  tokens: string[],
): WorkspaceSearchNoteHit | null {
  let score = 0;

  if (note.titleNormalized === normalizedQuery) {
    score += 250;
  }

  if (note.titleNormalized.startsWith(normalizedQuery)) {
    score += 180;
  }

  if (note.titleNormalized.includes(normalizedQuery)) {
    score += 120;
  }

  if (note.bodyNormalized.includes(normalizedQuery)) {
    score += 72;
  }

  let matchedTokenCount = 0;

  for (const token of tokens) {
    const inTitle = note.titleNormalized.includes(token);
    const inBody = note.bodyNormalized.includes(token);

    if (inTitle) {
      score += 36;
      matchedTokenCount += 1;
    }

    if (inBody) {
      score += 14;
      matchedTokenCount += 1;
    }
  }

  const titleSimilarity = diceCoefficient(normalizedQuery, note.titleNormalized);
  const bodySimilarity = diceCoefficient(
    normalizedQuery,
    note.bodyNormalized.slice(0, 900),
  );

  if (titleSimilarity >= 0.34) {
    score += Math.round(titleSimilarity * 90);
  }

  if (bodySimilarity >= 0.52) {
    score += Math.round(bodySimilarity * 28);
  }

  score += getRecencyBoost(note.updatedAt);

  if (note.isPinned) {
    score += 6;
  }

  const hasDirectContains =
    note.titleNormalized.includes(normalizedQuery) ||
    note.bodyNormalized.includes(normalizedQuery);

  if (!hasDirectContains && matchedTokenCount === 0 && score < 48) {
    return null;
  }

  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    folderId: note.folderId,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
    score,
    snippet: buildSnippet({
      body: note.bodyPlain,
      title: note.title,
      query: normalizedQuery,
      tokens,
      regex: null,
    }),
    highlights: tokens.filter((token) => token.length > 1).slice(0, 4),
    mode: "hybrid",
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
  query,
  tokens,
  regex,
}: {
  body: string;
  title: string;
  query: string;
  tokens: string[];
  regex: RegExp | null;
}) {
  const source = body.trim() || title;

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

  return source.toLocaleLowerCase("tr").indexOf(normalizedNeedle.toLocaleLowerCase("tr"));
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
