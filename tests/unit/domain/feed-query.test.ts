import { describe, expect, it } from "vitest";
import {
  buildFeedQueryProfile,
  normalizeFeedText,
  scoreFeedTextMatch,
  tokenizeFeedText,
} from "@/domain/feed/feed.query";

describe("feed query helpers", () => {
  it("normalizes text for matching", () => {
    expect(normalizeFeedText("  Artificial Intelligence & Generative AI!!  ")).toBe(
      "artificial intelligence generative ai"
    );
  });

  it("drops stop words and short tokens", () => {
    expect(tokenizeFeedText("The latest artificial intelligence and data engineering notes")).toEqual([
      "artificial",
      "intelligence",
      "data",
      "engineering",
      "notes",
    ]);
  });

  it("prefers the manual query when provided", () => {
    const profile = buildFeedQueryProfile({
      manualQuery: "LLM agents observability",
      titles: ["ignored title"],
    });

    expect(profile.query).toBe("LLM agents observability");
    expect(profile.phrases).toEqual(["LLM agents observability"]);
    expect(profile.keywords).toEqual(["llm", "agents", "observability"]);
  });

  it("scores exact phrase and keyword matches higher", () => {
    const profile = buildFeedQueryProfile({
      titles: ["AI agents"],
      tags: ["observability", "llm"],
      folderNames: ["AI Research"],
    });

    const strongMatch = scoreFeedTextMatch(
      profile,
      "LLM observability and AI agents inside AI Research"
    );
    const weakMatch = scoreFeedTextMatch(profile, "Frontend design trends");

    expect(strongMatch.score).toBeGreaterThan(weakMatch.score);
    expect(strongMatch.matchedKeywords.length).toBeGreaterThan(0);
    expect(strongMatch.matchedPhrases).toContain("AI agents");
  });

  it("supports regex-like and fuzzy keyword matching", () => {
    const profile = buildFeedQueryProfile({
      tags: ["observability", "analysis"],
    });

    const match = scoreFeedTextMatch(
      profile,
      "We examined the impact of observability in the system with analysis",
    );

    expect(match.matchedKeywords).toContain("observability");
    expect(match.matchedKeywords).toContain("analysis");
    expect(match.score).toBeGreaterThan(0);
  });
});
