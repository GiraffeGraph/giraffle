import { TRUSTED_NEWS_SOURCES, type TrustedNewsSource } from "./feed.news-sources";
import type { WorkspaceFeedLanguage } from "./feed.types";
import {
  buildFeedQueryProfile,
  limitText,
  normalizeFeedText,
  scoreFeedTextMatch,
  type FeedQueryProfile,
} from "./feed.query";

export interface NewsCandidate {
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  publishedAt: Date | null;
  sourceKey: string;
  whyRelevant: string;
  score: number;
}

interface ParsedFeedItem {
  title: string;
  summary: string | null;
  link: string | null;
  publishedAt: Date | null;
  sourceName: string | null;
}

const TECH_KEYWORDS = [
  "ai",
  "yapay",
  "zeka",
  "teknoloji",
  "technology",
  "startup",
  "software",
  "yazilim",
  "developer",
  "openai",
  "ml",
  "data",
  "robot",
  "apple",
  "google",
  "microsoft",
  "saas",
  "cloud",
];

const BUSINESS_KEYWORDS = [
  "ekonomi",
  "economy",
  "finance",
  "finans",
  "business",
  "startup",
  "yatirim",
  "investment",
  "market",
  "borsa",
  "kripto",
  "crypto",
  "ticaret",
  "trade",
  "company",
  "sirket",
];

export async function loadTrustedNewsCandidates(input: {
  language: WorkspaceFeedLanguage;
  queryProfile: FeedQueryProfile;
  sourceLabels: string[];
  limit?: number;
}) {
  const limit = input.limit ?? 12;
  const preferredTopics = inferPreferredTopics(input.queryProfile.keywords);
  const candidateSources = selectSources(input.language, preferredTopics);

  const feedResults = await Promise.allSettled(
    candidateSources.map((source) => fetchSourceItems(source)),
  );

  const candidates = feedResults.flatMap((result, index) => {
    if (result.status === "rejected") {
      console.error("Feed fetch failed", candidateSources[index]?.id, result.reason);
      return [];
    }

    return result.value;
  });

  const uniqueCandidates = new Map<string, NewsCandidate>();

  for (const candidate of candidates) {
    const haystack = [candidate.title, candidate.summary, candidate.sourceName]
      .filter(Boolean)
      .join(" ");
    const match = scoreFeedTextMatch(input.queryProfile, haystack);

    if (match.score <= 0) {
      continue;
    }

    const freshnessScore = computeFreshnessScore(candidate.publishedAt);
    const combinedScore = match.score * 0.7 + freshnessScore * 0.3;

    const sourceKey = normalizeSourceKey(candidate.link, candidate.title, candidate.sourceName);
    const whyRelevant = buildWhyRelevant({
      matchedTerms: [...match.matchedPhrases, ...match.matchedKeywords],
      sourceLabels: input.sourceLabels,
    });

    const nextCandidate: NewsCandidate = {
      title: candidate.title,
      summary: limitText(candidate.summary, 240) || null,
      sourceUrl: candidate.link,
      sourceName: candidate.sourceName,
      publishedAt: candidate.publishedAt,
      sourceKey,
      whyRelevant,
      score: combinedScore,
    };

    const existingCandidate = uniqueCandidates.get(sourceKey);

    if (!existingCandidate || existingCandidate.score < nextCandidate.score) {
      uniqueCandidates.set(sourceKey, nextCandidate);
    }
  }

  return Array.from(uniqueCandidates.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0);
    })
    .slice(0, limit);
}

function inferPreferredTopics(keywords: string[]) {
  const normalized = keywords.map((keyword) => normalizeFeedText(keyword));
  const topics = new Set<TrustedNewsSource["topics"][number]>(["general"]);

  if (normalized.some((keyword) => TECH_KEYWORDS.includes(keyword))) {
    topics.add("technology");
  }

  if (normalized.some((keyword) => BUSINESS_KEYWORDS.includes(keyword))) {
    topics.add("business");
  }

  return topics;
}

function selectSources(
  language: WorkspaceFeedLanguage,
  preferredTopics: Set<TrustedNewsSource["topics"][number]>,
) {
  const allowedLanguages = language === "mixed" ? ["tr", "en"] : [language];

  return TRUSTED_NEWS_SOURCES.filter((source) => {
    if (!allowedLanguages.includes(source.language)) {
      return false;
    }

    return source.topics.some((topic) => preferredTopics.has(topic));
  });
}

async function fetchSourceItems(source: TrustedNewsSource) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GiraffleFeedBot/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Feed request failed: ${source.url} (${response.status})`);
  }

  const xml = await response.text();
  return parseFeedXml(xml, source.title);
}

function parseFeedXml(xml: string, fallbackSourceName: string): ParsedFeedItem[] {
  const itemBlocks = extractBlocks(xml, "item");

  if (itemBlocks.length > 0) {
    return itemBlocks
      .map((block) => parseRssItem(block, fallbackSourceName))
      .filter((item): item is ParsedFeedItem => Boolean(item?.title));
  }

  const entryBlocks = extractBlocks(xml, "entry");
  return entryBlocks
    .map((block) => parseAtomEntry(block, fallbackSourceName))
    .filter((item): item is ParsedFeedItem => Boolean(item?.title));
}

function parseRssItem(block: string, fallbackSourceName: string): ParsedFeedItem | null {
  const title = cleanText(extractFirstTag(block, ["title"]));
  const summary = cleanText(
    extractFirstTag(block, ["description", "content:encoded", "content"]),
  );
  const link = cleanUrl(extractFirstTag(block, ["link", "guid"]));
  const publishedAt = parseFeedDate(
    extractFirstTag(block, ["pubDate", "published", "updated", "dc:date"]),
  );
  const sourceName = cleanText(extractSourceName(block)) ?? fallbackSourceName;

  if (!title) {
    return null;
  }

  return {
    title,
    summary,
    link,
    publishedAt,
    sourceName,
  };
}

function parseAtomEntry(block: string, fallbackSourceName: string): ParsedFeedItem | null {
  const title = cleanText(extractFirstTag(block, ["title"]));
  const summary = cleanText(
    extractFirstTag(block, ["summary", "content", "description"]),
  );
  const link = cleanUrl(extractAtomLink(block) ?? extractFirstTag(block, ["id"]));
  const publishedAt = parseFeedDate(
    extractFirstTag(block, ["published", "updated"]),
  );
  const sourceName = cleanText(extractSourceName(block)) ?? fallbackSourceName;

  if (!title) {
    return null;
  }

  return {
    title,
    summary,
    link,
    publishedAt,
    sourceName,
  };
}

function extractBlocks(xml: string, tagName: string) {
  const expression = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return Array.from(xml.matchAll(expression), (match) => match[1]);
}

function extractFirstTag(block: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const expression = new RegExp(
      `<${escapeForRegex(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeForRegex(tagName)}>`,
      "i",
    );
    const match = block.match(expression);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractAtomLink(block: string) {
  const attributeMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
  return attributeMatch?.[1] ?? null;
}

function extractSourceName(block: string) {
  const sourceTag = block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);

  if (sourceTag?.[1]) {
    return sourceTag[1];
  }

  const sourceAttribute = block.match(/<source[^>]*>([^<]+)<\/source>/i);
  return sourceAttribute?.[1] ?? null;
}

function cleanText(value: string | null) {
  if (!value) {
    return null;
  }

  return limitText(
    decodeHtmlEntities(
      stripHtml(value.replace(/<!\[CDATA\[|\]\]>/g, " ")),
    ),
    320,
  );
}

function cleanUrl(value: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(decodeHtmlEntities(normalized));
    url.hash = "";

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return decodeHtmlEntities(normalized);
  }
}

function parseFeedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(decodeHtmlEntities(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value: string) {
  const named = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return named.replace(/&#(x?[0-9a-fA-F]+);/g, (_match, entity: string) => {
    const codePoint = entity.toLowerCase().startsWith("x")
      ? Number.parseInt(entity.slice(1), 16)
      : Number.parseInt(entity, 10);

    if (!Number.isFinite(codePoint)) {
      return "";
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return "";
    }
  });
}

function normalizeSourceKey(
  url: string | null,
  title: string,
  sourceName: string | null,
) {
  if (url) {
    return url;
  }

  return `${normalizeFeedText(title)}::${normalizeFeedText(sourceName)}`;
}

function computeFreshnessScore(publishedAt: Date | null) {
  if (!publishedAt) {
    return 0.3;
  }

  const hours = Math.max(0, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60));

  if (hours <= 12) {
    return 1;
  }

  if (hours <= 24) {
    return 0.8;
  }

  if (hours <= 72) {
    return 0.55;
  }

  if (hours <= 168) {
    return 0.35;
  }

  return 0.1;
}

function buildWhyRelevant(input: {
  matchedTerms: string[];
  sourceLabels: string[];
}) {
  const topTerms = Array.from(new Set(input.matchedTerms)).slice(0, 3);
  const labels = input.sourceLabels.slice(0, 2);

  if (topTerms.length > 0 && labels.length > 0) {
    return `${labels.join(" ve ")} içinde geçen ${topTerms.join(", ")} kavramlarıyla örtüşüyor.`;
  }

  if (topTerms.length > 0) {
    return `${topTerms.join(", ")} kavramları seçtiğin kaynaklarla eşleşiyor.`;
  }

  if (labels.length > 0) {
    return `${labels.join(" ve ")} etrafındaki gündemle ilişkili görünüyor.`;
  }

  return "Seçtiğin kaynakların ana temasıyla ilişkili görünüyor.";
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildNewsQueryPreview(input: {
  manualQuery?: string | null;
  titles?: string[];
  tags?: string[];
  folderNames?: string[];
  extraText?: string[];
}) {
  return buildFeedQueryProfile(input);
}
