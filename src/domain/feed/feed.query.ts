const RAW_STOP_WORDS = [
  "ve",
  "veya",
  "ile",
  "için",
  "bir",
  "bu",
  "şu",
  "o",
  "da",
  "de",
  "mi",
  "mı",
  "mu",
  "mü",
  "gibi",
  "çok",
  "daha",
  "güncel",
  "haber",
  "not",
  "klasör",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "your",
  "about",
  "news",
  "latest",
] as const;

export interface FeedQueryProfile {
  query: string;
  keywords: string[];
  phrases: string[];
}

export function normalizeFeedText(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(RAW_STOP_WORDS.map((word) => normalizeFeedText(word)));

export function tokenizeFeedText(value: string | null | undefined) {
  return normalizeFeedText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function collectKeywordCounts(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    for (const token of tokenizeFeedText(value)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return counts;
}

export function buildFeedQueryProfile(input: {
  manualQuery?: string | null;
  titles?: string[];
  tags?: string[];
  folderNames?: string[];
  extraText?: string[];
}) {
  const manualQuery = input.manualQuery?.trim();

  if (manualQuery) {
    const keywords = Array.from(new Set(tokenizeFeedText(manualQuery))).slice(0, 12);

    return {
      query: manualQuery,
      keywords,
      phrases: manualQuery.length > 0 ? [manualQuery] : [],
    } satisfies FeedQueryProfile;
  }

  const phrases = [
    ...(input.titles ?? []).map((value) => value.trim()).filter(Boolean),
    ...(input.folderNames ?? []).map((value) => value.trim()).filter(Boolean),
  ].slice(0, 6);

  const counts = collectKeywordCounts([
    ...(input.titles ?? []),
    ...(input.tags ?? []),
    ...(input.folderNames ?? []),
    ...(input.extraText ?? []),
  ]);

  const keywords = Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0], "tr");
    })
    .map(([keyword]) => keyword)
    .slice(0, 12);

  const queryParts = [...phrases.slice(0, 3), ...keywords.slice(0, 6)];

  return {
    query: queryParts.join(" ").trim(),
    keywords,
    phrases,
  } satisfies FeedQueryProfile;
}

export function scoreFeedTextMatch(
  profile: FeedQueryProfile,
  text: string,
) {
  const normalizedText = normalizeFeedText(text);
  const textTokens = new Set(tokenizeFeedText(text));

  const exactKeywordMatches = profile.keywords.filter((keyword) =>
    textTokens.has(keyword),
  );

  const regexKeywordMatches = profile.keywords.filter((keyword) => {
    if (textTokens.has(keyword) || keyword.length < 4) {
      return false;
    }

    return buildKeywordRegex(keyword).test(normalizedText);
  });

  const fuzzyKeywordMatches = profile.keywords.filter((keyword) => {
    if (
      keyword.length < 4 ||
      exactKeywordMatches.includes(keyword) ||
      regexKeywordMatches.includes(keyword)
    ) {
      return false;
    }

    return Array.from(textTokens).some((token) => {
      if (token.length < 4) {
        return false;
      }

      return token.includes(keyword) || keyword.includes(token);
    });
  });

  const matchedKeywordSet = new Set<string>([
    ...exactKeywordMatches,
    ...regexKeywordMatches,
    ...fuzzyKeywordMatches,
  ]);

  const matchedKeywords = Array.from(matchedKeywordSet);

  const matchedPhrases = profile.phrases.filter((phrase) => {
    const normalizedPhrase = normalizeFeedText(phrase);
    return normalizedPhrase.length >= 4 && normalizedText.includes(normalizedPhrase);
  });

  const keywordScore = profile.keywords.length === 0
    ? 0
    : matchedKeywords.length / profile.keywords.length;
  const phraseScore = profile.phrases.length === 0
    ? 0
    : matchedPhrases.length / profile.phrases.length;

  return {
    score: keywordScore * 0.65 + phraseScore * 0.35,
    matchedKeywords,
    matchedPhrases,
  };
}

function buildKeywordRegex(keyword: string) {
  return new RegExp(`\\b${escapeRegex(keyword)}[\\p{L}\\p{N}-]*\\b`, "u");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function limitText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
