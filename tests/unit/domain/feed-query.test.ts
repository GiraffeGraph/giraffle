import { describe, expect, it } from "vitest";
import {
  buildFeedQueryProfile,
  normalizeFeedText,
  scoreFeedTextMatch,
  tokenizeFeedText,
} from "@/domain/feed/feed.query";

describe("feed query helpers", () => {
  it("normalizes Turkish text for matching", () => {
    expect(normalizeFeedText("  Yapay Zekâ & Üretken AI!!  ")).toBe(
      "yapay zeka uretken ai"
    );
  });

  it("drops stop words and short tokens", () => {
    expect(tokenizeFeedText("En güncel yapay zeka ve veri mühendisliği notları")).toEqual([
      "yapay",
      "zeka",
      "veri",
      "muhendisligi",
      "notlari",
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
      titles: ["Yapay zeka ajanları"],
      tags: ["observability", "llm"],
      folderNames: ["AI Research"],
    });

    const strongMatch = scoreFeedTextMatch(
      profile,
      "AI Research içinde LLM observability ve yapay zeka ajanları"
    );
    const weakMatch = scoreFeedTextMatch(profile, "Frontend tasarım trendleri");

    expect(strongMatch.score).toBeGreaterThan(weakMatch.score);
    expect(strongMatch.matchedKeywords.length).toBeGreaterThan(0);
    expect(strongMatch.matchedPhrases).toContain("Yapay zeka ajanları");
  });

  it("supports regex-like and fuzzy keyword matching", () => {
    const profile = buildFeedQueryProfile({
      tags: ["observability", "analiz"],
    });

    const match = scoreFeedTextMatch(
      profile,
      "Sistemde observabilitynin etkisini analizleriyle inceledik",
    );

    expect(match.matchedKeywords).toContain("observability");
    expect(match.matchedKeywords).toContain("analiz");
    expect(match.score).toBeGreaterThan(0);
  });
});
