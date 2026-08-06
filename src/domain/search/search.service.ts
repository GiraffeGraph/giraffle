import { db } from "@/lib/db";
import { isRecord } from "@giraffle/domain";

const DEFAULT_LIMIT = 40;
const MAX_SCAN_NOTES = 320;
const MAX_BLOCKS_PER_NOTE = 180;
const MAX_QUERY_LENGTH = 220;

export type WorkspaceSearchMode = "recent" | "hybrid" | "regex";
export type WorkspaceSearchReasonType =
  | "title"
  | "path"
  | "body"
  | "fuzzy"
  | "regex"
  | "filter";

export interface WorkspaceSearchReason {
  type: WorkspaceSearchReasonType;
  label: string;
}

export interface WorkspaceSearchNoteHit {
  id: string;
  title: string;
  parentId: string | null;
  parentPath: string | null;
  isPinned: boolean;
  updatedAt: Date;
  score: number;
  snippet: string;
  highlights: string[];
  reasons: WorkspaceSearchReason[];
  mode: Exclude<WorkspaceSearchMode, "recent"> | "recent";
}

export interface ParsedWorkspaceSearchQuery {
  raw: string;
  normalizedText: string;
  tokens: string[];
  phrases: string[];
  negativeTokens: string[];
  pathFilters: string[];
  excludedPaths: string[];
  titleFilters: string[];
  excludedTitles: string[];
  isPinned: boolean | null;
  isRegex: boolean;
  regex: RegExp | null;
  regexError: string | null;
}

export interface WorkspaceNoteSearchResult {
  query: string;
  parsed: ParsedWorkspaceSearchQuery;
  mode: WorkspaceSearchMode;
  scannedNotes: number;
  regexError: string | null;
  hits: WorkspaceSearchNoteHit[];
}

interface IndexedNote {
  id: string;
  title: string;
  titleNormalized: string;
  parentId: string | null;
  parentPath: string | null;
  parentPathNormalized: string;
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
  const parsed = parseWorkspaceSearchQuery(trimmedQuery);

  const [noteRows, pageIndex] = await Promise.all([
    db.note.findMany({
      where: {
        userId,
        isArchived: false,
        boardTaskSource: null,
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      take: MAX_SCAN_NOTES,
      select: {
        id: true,
        title: true,
        parentId: true,
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
    }),
    // Every page, not just the scanned window: an ancestor may fall outside it.
    db.note.findMany({
      where: { userId, boardTaskSource: null },
      select: {
        id: true,
        title: true,
        parentId: true,
      },
    }),
  ]);

  const pathById = buildPagePathMap(pageIndex);
  const indexedNotes: IndexedNote[] = noteRows.map((note) => {
    const bodyPlain = note.blocks
      .map((block) => extractTextFromJson(block.content))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const parentPath = note.parentId ? pathById.get(note.parentId) ?? null : null;
    return {
      id: note.id,
      title: note.title,
      titleNormalized: normalizeForSearch(note.title),
      parentId: note.parentId,
      parentPath,
      parentPathNormalized: normalizeForSearch(parentPath ?? ""),
      isPinned: note.isPinned,
      updatedAt: note.updatedAt,
      bodyPlain,
      bodyNormalized: normalizeForSearch(bodyPlain),
    };
  });

  if (!trimmedQuery) {
    return {
      query: "",
      parsed,
      mode: "recent",
      scannedNotes: indexedNotes.length,
      regexError: null,
      hits: indexedNotes.slice(0, limit).map((note, index) => ({
        id: note.id,
        title: note.title,
        parentId: note.parentId,
        parentPath: note.parentPath,
        isPinned: note.isPinned,
        updatedAt: note.updatedAt,
        score: limit - index,
        snippet: buildSnippet({
          body: note.bodyPlain,
          title: note.title,
          parentPath: note.parentPath,
            parsed,
        }),
        highlights: [],
        reasons: [{ type: "title", label: "Recent" }],
        mode: "recent",
      })),
    };
  }

  if (parsed.isRegex) {
    if (!parsed.regex) {
      return {
        query: trimmedQuery,
        parsed,
        mode: "regex",
        scannedNotes: indexedNotes.length,
        regexError: parsed.regexError,
        hits: [],
      };
    }

    const regexHits = indexedNotes
      .filter((note) => noteMatchesFilters(note, parsed))
      .map((note) => scoreRegexHit(note, parsed))
      .filter((hit): hit is WorkspaceSearchNoteHit => hit !== null)
      .sort(sortByScoreThenDate)
      .slice(0, limit);

    return {
      query: trimmedQuery,
      parsed,
      mode: "regex",
      scannedNotes: indexedNotes.length,
      regexError: null,
      hits: regexHits,
    };
  }

  const hybridHits = indexedNotes
    .filter((note) => noteMatchesFilters(note, parsed))
    .map((note) => scoreHybridHit(note, parsed))
    .filter((hit): hit is WorkspaceSearchNoteHit => hit !== null)
    .sort(sortByScoreThenDate)
    .slice(0, limit);

  return {
    query: trimmedQuery,
    parsed,
    mode: "hybrid",
    scannedNotes: indexedNotes.length,
    regexError: null,
    hits: hybridHits,
  };
}

export function parseWorkspaceSearchQuery(query: string): ParsedWorkspaceSearchQuery {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  const regexParsing = parseRegexQuery(trimmed);

  if (regexParsing.isRegex) {
    return {
      raw: trimmed,
      normalizedText: "",
      tokens: [],
      phrases: [],
      negativeTokens: [],
      pathFilters: [],
      excludedPaths: [],
      titleFilters: [],
      excludedTitles: [],
      isPinned: null,
      isRegex: true,
      regex: regexParsing.regex,
      regexError: regexParsing.error,
    };
  }

  const pathFilters: string[] = [];
  const excludedPaths: string[] = [];
  const titleFilters: string[] = [];
  const excludedTitles: string[] = [];
  const positiveTokens: string[] = [];
  const negativeTokens: string[] = [];
  const phrases: string[] = [];
  let isPinned: boolean | null = null;

  for (const token of splitSearchTerms(trimmed)) {
    const isNegated = token.startsWith("-");
    const rawValue = isNegated ? token.slice(1) : token;

    if (!rawValue) {
      continue;
    }

    const cleanedPhrase = normalizeQuotedTerm(rawValue);

    if (!cleanedPhrase) {
      continue;
    }

    const [prefixRaw, ...valueParts] = cleanedPhrase.split(":");
    const hasPrefix = valueParts.length > 0;
    const prefix = prefixRaw.toLowerCase();
    const value = hasPrefix ? normalizeQuotedTerm(valueParts.join(":")) : cleanedPhrase;
    const normalizedValue = normalizeForSearch(value);

    if (!normalizedValue && prefix !== "is") {
      continue;
    }

    if (hasPrefix && prefix === "path") {
      (isNegated ? excludedPaths : pathFilters).push(normalizedValue);
      continue;
    }

    if (hasPrefix && prefix === "title") {
      (isNegated ? excludedTitles : titleFilters).push(normalizedValue);
      continue;
    }

    if (hasPrefix && prefix === "is") {
      if (value.toLowerCase() === "pinned") {
        isPinned = !isNegated;
      }
      continue;
    }

    if (isPhraseToken(rawValue)) {
      if (isNegated) {
        negativeTokens.push(normalizedValue);
      } else {
        phrases.push(normalizedValue);
        positiveTokens.push(...tokenize(normalizedValue));
      }
      continue;
    }

    if (isNegated) {
      negativeTokens.push(normalizedValue);
      continue;
    }

    positiveTokens.push(normalizedValue);
  }

  const normalizedText = Array.from(new Set([...phrases, ...positiveTokens])).join(" ");

  return {
    raw: trimmed,
    normalizedText,
    tokens: tokenize(normalizedText),
    phrases,
    negativeTokens: Array.from(new Set(negativeTokens)),
    pathFilters: Array.from(new Set(pathFilters)),
    excludedPaths: Array.from(new Set(excludedPaths)),
    titleFilters: Array.from(new Set(titleFilters)),
    excludedTitles: Array.from(new Set(excludedTitles)),
    isPinned,
    isRegex: false,
    regex: null,
    regexError: null,
  };
}

function scoreRegexHit(
  note: IndexedNote,
  parsed: ParsedWorkspaceSearchQuery,
): WorkspaceSearchNoteHit | null {
  const regex = parsed.regex;

  if (!regex) {
    return null;
  }

  const titleMatches = collectRegexMatches(note.title, regex, 6);
  const pathMatches = collectRegexMatches(note.parentPath ?? "", regex, 4);
  const bodyMatches = collectRegexMatches(note.bodyPlain, regex, 10);

  if (
    titleMatches.length === 0 &&
    pathMatches.length === 0 &&
    bodyMatches.length === 0
  ) {
    return null;
  }

  const reasons: WorkspaceSearchReason[] = [];
  addFilterReasons(reasons, parsed);

  if (titleMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex title" });
  }

  if (pathMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex path" });
  }


  if (bodyMatches.length > 0) {
    reasons.push({ type: "regex", label: "Regex body" });
  }

  const score =
    titleMatches.length * 150 +
    pathMatches.length * 80 +
    bodyMatches.length * 24 +
    phraseBoost(note, parsed) +
    getRecencyBoost(note.updatedAt) +
    (note.isPinned ? 6 : 0);

  return {
    id: note.id,
    title: note.title,
    parentId: note.parentId,
    parentPath: note.parentPath,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
    score,
    snippet: buildSnippet({
      body: note.bodyPlain,
      title: note.title,
      parentPath: note.parentPath,
        parsed,
    }),
    highlights: [...titleMatches, ...pathMatches, ...bodyMatches].slice(0, 6),
    reasons: dedupeReasons(reasons).slice(0, 5),
    mode: "regex",
  };
}

function scoreHybridHit(
  note: IndexedNote,
  parsed: ParsedWorkspaceSearchQuery,
): WorkspaceSearchNoteHit | null {
  let score = 0;
  const reasons: WorkspaceSearchReason[] = [];
  const highlights = new Set<string>();

  addFilterReasons(reasons, parsed);

  score += scoreTextField({
    label: "Title match",
    reasonType: "title",
    valueNormalized: note.titleNormalized,
    queryNormalized: parsed.normalizedText,
    tokens: parsed.tokens,
    exact: 260,
    startsWith: 180,
    contains: 125,
    tokenHit: 38,
    fuzzyMin: 0.36,
    fuzzyWeight: 95,
    reasons,
  });

  score += scoreTextField({
    label: "Path match",
    reasonType: "path",
    valueNormalized: note.parentPathNormalized,
    queryNormalized: parsed.normalizedText,
    tokens: parsed.tokens,
    exact: 190,
    startsWith: 92,
    contains: 76,
    tokenHit: 20,
    fuzzyMin: 0.42,
    fuzzyWeight: 54,
    reasons,
  });

  score += scoreBodyField({
    note,
    parsed,
    reasons,
  });

  const semanticSignals = computeSemanticSignals(note, parsed);
  score += semanticSignals.score;

  if (semanticSignals.score > 0) {
    reasons.push({
      type: "fuzzy",
      label: semanticSignals.label,
    });
  }

  score += phraseBoost(note, parsed);

  if (note.isPinned) {
    score += 6;
  }

  score += getRecencyBoost(note.updatedAt);

  const hasStrongMatch = reasons.some((reason) => reason.type !== "fuzzy") || score >= 68;

  if (!hasStrongMatch) {
    return null;
  }

  for (const token of parsed.tokens) {
    if (
      note.titleNormalized.includes(token) ||
      note.parentPathNormalized.includes(token) ||
      false
    ) {
      highlights.add(token);
    }
  }

  return {
    id: note.id,
    title: note.title,
    parentId: note.parentId,
    parentPath: note.parentPath,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt,
    score,
    snippet: buildSnippet({
      body: note.bodyPlain,
      title: note.title,
      parentPath: note.parentPath,
        parsed,
    }),
    highlights: Array.from(highlights).slice(0, 6),
    reasons: dedupeReasons(reasons).slice(0, 5),
    mode: "hybrid",
  };
}

function noteMatchesFilters(note: IndexedNote, parsed: ParsedWorkspaceSearchQuery) {
  if (parsed.isPinned !== null && note.isPinned !== parsed.isPinned) {
    return false;
  }

  if (
    parsed.pathFilters.length > 0 &&
    !parsed.pathFilters.every((filter) => note.parentPathNormalized.includes(filter))
  ) {
    return false;
  }

  if (
    parsed.excludedPaths.length > 0 &&
    parsed.excludedPaths.some((filter) => note.parentPathNormalized.includes(filter))
  ) {
    return false;
  }

  if (
    parsed.titleFilters.length > 0 &&
    !parsed.titleFilters.every((filter) => note.titleNormalized.includes(filter))
  ) {
    return false;
  }

  if (
    parsed.excludedTitles.length > 0 &&
    parsed.excludedTitles.some((filter) => note.titleNormalized.includes(filter))
  ) {
    return false;
  }

  const combined = [
    note.titleNormalized,
    note.parentPathNormalized,
    note.bodyNormalized,
  ]
    .filter(Boolean)
    .join(" ");

  if (parsed.negativeTokens.some((token) => combined.includes(token))) {
    return false;
  }

  return true;
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

  if (queryNormalized) {
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
    queryNormalized ? diceCoefficient(queryNormalized, valueNormalized) : 0,
    tokenSetSimilarity(tokens, tokenize(valueNormalized)),
  );

  if (fuzzyScore >= fuzzyMin) {
    score += Math.round(fuzzyScore * fuzzyWeight);
  }

  return score;
}

function scoreBodyField({
  note,
  parsed,
  reasons,
}: {
  note: IndexedNote;
  parsed: ParsedWorkspaceSearchQuery;
  reasons: WorkspaceSearchReason[];
}) {
  if (!note.bodyNormalized) {
    return 0;
  }

  let score = 0;
  let bodyMatched = false;

  if (parsed.normalizedText && note.bodyNormalized.includes(parsed.normalizedText)) {
    score += 70;
    bodyMatched = true;
  }

  let tokenHits = 0;

  for (const token of parsed.tokens) {
    if (note.bodyNormalized.includes(token)) {
      tokenHits += 1;
      score += 12;
    }
  }

  if (tokenHits >= Math.max(2, Math.ceil(parsed.tokens.length / 2))) {
    bodyMatched = true;
  }

  const limitedBody = note.bodyNormalized.slice(0, 1200);
  const fuzzyScore = Math.max(
    parsed.normalizedText ? diceCoefficient(parsed.normalizedText, limitedBody) : 0,
    tokenSetSimilarity(parsed.tokens, tokenize(limitedBody).slice(0, 80)),
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
  parsed: ParsedWorkspaceSearchQuery,
) {
  const titleTokens = tokenize(note.titleNormalized);
  const pathTokens = tokenize(note.parentPathNormalized);
  const topBodyTokens = tokenize(note.bodyNormalized).slice(0, 60);

  const titleSimilarity = tokenSetSimilarity(parsed.tokens, titleTokens);
  const pathSimilarity = tokenSetSimilarity(parsed.tokens, pathTokens);
  const bodySimilarity = tokenSetSimilarity(parsed.tokens, topBodyTokens);
  const phraseSimilarity = Math.max(
    parsed.normalizedText ? diceCoefficient(parsed.normalizedText, note.titleNormalized) : 0,
    parsed.normalizedText ? diceCoefficient(parsed.normalizedText, note.parentPathNormalized) : 0,
  );

  const score =
    Math.round(titleSimilarity * 72) +
    Math.round(pathSimilarity * 34) +
    Math.round(bodySimilarity * 18) +
    Math.round(phraseSimilarity * 36);

  if (score < 26) {
    return {
      score: 0,
      label: "",
    };
  }

  if (pathSimilarity > titleSimilarity) {
    return {
      score,
      label: "Path fuzzy",
    };
  }

  return {
    score,
    label: "Fuzzy match",
  };
}
function phraseBoost(note: IndexedNote, parsed: ParsedWorkspaceSearchQuery) {
  if (parsed.phrases.length === 0) {
    return 0;
  }

  let score = 0;

  for (const phrase of parsed.phrases) {
    if (note.titleNormalized.includes(phrase)) {
      score += 90;
    }

    if (note.parentPathNormalized.includes(phrase)) {
      score += 54;
    }

    if (note.bodyNormalized.includes(phrase)) {
      score += 28;
    }
  }

  return score;
}

function addFilterReasons(
  reasons: WorkspaceSearchReason[],
  parsed: ParsedWorkspaceSearchQuery,
) {
  if (parsed.isPinned === true) {
    reasons.push({ type: "filter", label: "Pinned only" });
  }

  if (parsed.pathFilters.length > 0) {
    reasons.push({ type: "filter", label: `path:${parsed.pathFilters[0]}` });
  }

  if (parsed.titleFilters.length > 0) {
    reasons.push({ type: "filter", label: `title:${parsed.titleFilters[0]}` });
  }
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
  parentPath,
  parsed,
}: {
  body: string;
  title: string;
  parentPath: string | null;
  parsed: ParsedWorkspaceSearchQuery;
}) {
  const sourceCandidates = [
    body.trim(),
    parentPath?.trim() ?? "",
    title,
  ].filter(Boolean);
  const source = sourceCandidates[0] ?? title;

  if (!source) {
    return "İçerik bulunamadı.";
  }

  let index = 0;

  if (parsed.regex) {
    const regexWithGlobal = cloneRegex(parsed.regex, true);
    const match = regexWithGlobal.exec(source);
    index = match?.index ?? 0;
  } else {
    const phraseNeedle = parsed.phrases[0] ?? parsed.normalizedText;
    const directMatch = findCaseInsensitiveIndex(source, phraseNeedle);

    if (directMatch >= 0) {
      index = directMatch;
    } else {
      const tokenMatch = parsed.tokens
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

function splitSearchTerms(query: string) {
  return query.match(/(?:-?[a-z]+:"[^"]+")|(?:-?[a-z]+:\S+)|(?:-?"[^"]+")|(?:\S+)/gi) ?? [];
}

function normalizeQuotedTerm(value: string) {
  return value.replace(/^"|"$/g, "").trim();
}

function isPhraseToken(value: string) {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2;
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

/**
 * Ancestor path of every page ("Project / Research"), used for path: filters
 * and for showing where a hit lives.
 */
function buildPagePathMap(
  pages: Array<{
    id: string;
    title: string;
    parentId: string | null;
  }>,
) {
  const pageById = new Map(
    pages.map((page) => [page.id, { ...page, path: "" }]),
  );

  const resolve = (pageId: string, seen: Set<string>): string => {
    const current = pageById.get(pageId);

    if (!current || seen.has(pageId)) {
      return "";
    }

    if (current.path) {
      return current.path;
    }

    seen.add(pageId);
    const parentPath = current.parentId ? resolve(current.parentId, seen) : "";
    current.path = parentPath ? `${parentPath} / ${current.title}` : current.title;
    return current.path;
  };

  for (const page of pages) {
    resolve(page.id, new Set());
  }

  return new Map(
    Array.from(pageById.entries()).map(([pageId, page]) => [pageId, page.path]),
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

    if (!isRecord(node)) {
      return;
    }

    if (typeof node.text === "string") {
      segments.push(node.text);
    }

    if (node.content) {
      visit(node.content);
    }

    if (!node.content) {
      for (const [key, child] of Object.entries(node)) {
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
