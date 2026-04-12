import type { WorkspaceFeedLanguage } from "./feed.types";

export interface TrustedNewsSource {
  id: string;
  title: string;
  url: string;
  language: Exclude<WorkspaceFeedLanguage, "mixed">;
  topics: Array<"general" | "technology" | "business">;
}

export const TRUSTED_NEWS_SOURCES: TrustedNewsSource[] = [
  {
    id: "bbc-tr",
    title: "BBC Türkçe",
    url: "https://feeds.bbci.co.uk/turkce/rss.xml",
    language: "tr",
    topics: ["general"],
  },
  {
    id: "trt-haber",
    title: "TRT Haber",
    url: "https://www.trthaber.com/sondakika_articles.rss",
    language: "tr",
    topics: ["general"],
  },
  {
    id: "hurriyet",
    title: "Hürriyet",
    url: "https://www.hurriyet.com.tr/rss/anasayfa",
    language: "tr",
    topics: ["general"],
  },
  {
    id: "haberturk",
    title: "Habertürk",
    url: "https://www.haberturk.com/rss",
    language: "tr",
    topics: ["general", "business"],
  },
  {
    id: "cnnturk",
    title: "CNN Türk",
    url: "https://www.cnnturk.com/feed/rss/all/news",
    language: "tr",
    topics: ["general"],
  },
  {
    id: "sozcu",
    title: "Sözcü",
    url: "https://www.sozcu.com.tr/feeds-rss-category-gundem?output=xml",
    language: "tr",
    topics: ["general"],
  },
  {
    id: "webrazzi",
    title: "Webrazzi",
    url: "https://webrazzi.com/feed/",
    language: "tr",
    topics: ["technology", "business"],
  },
  {
    id: "shiftdelete",
    title: "ShiftDelete",
    url: "https://shiftdelete.net/feed",
    language: "tr",
    topics: ["technology"],
  },
  {
    id: "bbc-world",
    title: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    language: "en",
    topics: ["general"],
  },
  {
    id: "guardian-world",
    title: "The Guardian",
    url: "https://www.theguardian.com/world/rss",
    language: "en",
    topics: ["general"],
  },
  {
    id: "nyt-world",
    title: "New York Times World",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    language: "en",
    topics: ["general"],
  },
  {
    id: "npr-world",
    title: "NPR World",
    url: "https://feeds.npr.org/1004/rss.xml",
    language: "en",
    topics: ["general"],
  },
  {
    id: "aljazeera",
    title: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    language: "en",
    topics: ["general"],
  },
  {
    id: "ars-technica",
    title: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    language: "en",
    topics: ["technology"],
  },
  {
    id: "techcrunch",
    title: "TechCrunch",
    url: "https://feeds.feedburner.com/TechCrunch/",
    language: "en",
    topics: ["technology", "business"],
  },
  {
    id: "the-verge",
    title: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    language: "en",
    topics: ["technology"],
  },
  {
    id: "mit-tech-review",
    title: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    language: "en",
    topics: ["technology", "business"],
  },
  {
    id: "venturebeat",
    title: "VentureBeat",
    url: "https://venturebeat.com/feed/",
    language: "en",
    topics: ["technology", "business"],
  },
];
