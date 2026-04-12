import { buildFeedQueryProfile, scoreFeedTextMatch } from "./feed.query";

export interface SuggestionNoteContext {
  id: string;
  title: string;
  folderId: string | null;
  folderName: string | null;
  tags: string[];
}

export interface SuggestionFolderContext {
  id: string;
  name: string;
}

export interface SuggestionCandidate {
  itemType: string;
  title: string;
  summary: string | null;
  whyRelevant: string;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceKey: string;
  positionScore: number;
  payload: Record<string, unknown>;
}

export function buildSuggestionCandidates(input: {
  sourceNotes: SuggestionNoteContext[];
  sourceFolders: SuggestionFolderContext[];
  allNotes: SuggestionNoteContext[];
  folderDescendantIds: Map<string, Set<string>>;
  limit?: number;
}) {
  const limit = input.limit ?? 10;
  const candidates = new Map<string, SuggestionCandidate>();

  for (const note of input.sourceNotes) {
    const noteProfile = buildFeedQueryProfile({
      titles: [note.title],
      tags: note.tags,
      folderNames: note.folderName ? [note.folderName] : [],
    });

    const noteCandidates = input.allNotes
      .filter((candidate) => candidate.id !== note.id)
      .map((candidate) => {
        const match = scoreFeedTextMatch(
          noteProfile,
          [candidate.title, candidate.tags.join(" "), candidate.folderName].join(" "),
        );

        return {
          note: candidate,
          score: match.score,
          matchedTerms: [...match.matchedPhrases, ...match.matchedKeywords],
        };
      })
      .filter((candidate) => candidate.score >= 0.22)
      .sort((left, right) => right.score - left.score);

    const bestCandidate = noteCandidates[0];

    if (note.folderId === null && bestCandidate?.note.folderId && bestCandidate.score >= 0.32) {
      pushCandidate(candidates, {
        itemType: "note",
        title: `“${note.title}” için klasör önerisi`,
        summary: `${bestCandidate.note.folderName} klasörüne taşımayı düşünebilirsin.`,
        whyRelevant: `${bestCandidate.matchedTerms.slice(0, 3).join(", ")} başlık ve etiketleri benzer bir küme oluşturuyor.`,
        sourceUrl: `/notes/${note.id}`,
        sourceName: bestCandidate.note.folderName,
        sourceKey: `move:${note.id}:${bestCandidate.note.folderId}`,
        positionScore: bestCandidate.score + 0.25,
        payload: {
          suggestionType: "move-note",
          noteId: note.id,
          targetFolderId: bestCandidate.note.folderId,
          targetFolderName: bestCandidate.note.folderName,
        },
      });
    }

    if (note.tags.length === 0 && bestCandidate?.note.tags.length) {
      pushCandidate(candidates, {
        itemType: "note",
        title: `“${note.title}” için etiket önerisi`,
        summary: `${bestCandidate.note.tags.slice(0, 3).map((tag) => `#${tag}`).join(", ")} etiketleri bu notu bulmayı kolaylaştırabilir.`,
        whyRelevant: `${bestCandidate.note.title} ile benzer konu kümeleri bulundu.`,
        sourceUrl: `/notes/${note.id}`,
        sourceName: "Etiket önerisi",
        sourceKey: `tag:${note.id}:${bestCandidate.note.tags.slice(0, 3).join("|")}`,
        positionScore: bestCandidate.score + 0.15,
        payload: {
          suggestionType: "add-tags",
          noteId: note.id,
          tags: bestCandidate.note.tags.slice(0, 3),
        },
      });
    }

    if (bestCandidate && bestCandidate.score >= 0.4) {
      pushCandidate(candidates, {
        itemType: "note",
        title: `“${note.title}” ile “${bestCandidate.note.title}” notlarını ilişkilendir`,
        summary: `Bu iki not aynı konu etrafında toplanıyor; bağlantı veya ortak klasör düşünebilirsin.`,
        whyRelevant: `${bestCandidate.matchedTerms.slice(0, 3).join(", ")} kavramları ortak.`,
        sourceUrl: `/notes/${bestCandidate.note.id}`,
        sourceName: bestCandidate.note.folderName ?? "İlgili not",
        sourceKey: buildPairKey(note.id, bestCandidate.note.id),
        positionScore: bestCandidate.score,
        payload: {
          suggestionType: "relate-notes",
          sourceNoteId: note.id,
          targetNoteId: bestCandidate.note.id,
        },
      });
    }
  }

  for (const folder of input.sourceFolders) {
    const excludedFolderIds = input.folderDescendantIds.get(folder.id) ?? new Set<string>([folder.id]);
    const folderProfile = buildFeedQueryProfile({ titles: [folder.name] });

    const matches = input.allNotes
      .filter((note) => note.folderId === null || !excludedFolderIds.has(note.folderId))
      .map((note) => ({
        note,
        match: scoreFeedTextMatch(
          folderProfile,
          [note.title, note.tags.join(" "), note.folderName].join(" "),
        ),
      }))
      .filter((candidate) => candidate.match.score >= 0.28)
      .sort((left, right) => right.match.score - left.match.score)
      .slice(0, 4);

    for (const candidate of matches) {
      pushCandidate(candidates, {
        itemType: "folder",
        title: `“${candidate.note.title}” notu “${folder.name}” klasörüne uyuyor`,
        summary: `Bu notu ${folder.name} içine alırsan aynı temadaki içerikleri bir araya getirebilirsin.`,
        whyRelevant: `${candidate.match.matchedKeywords.slice(0, 3).join(", ")} kavramları klasör adıyla eşleşiyor.`,
        sourceUrl: `/notes/${candidate.note.id}`,
        sourceName: folder.name,
        sourceKey: `folder-match:${folder.id}:${candidate.note.id}`,
        positionScore: candidate.match.score + 0.1,
        payload: {
          suggestionType: "move-note-into-folder",
          noteId: candidate.note.id,
          targetFolderId: folder.id,
          targetFolderName: folder.name,
        },
      });
    }
  }

  return Array.from(candidates.values())
    .sort((left, right) => right.positionScore - left.positionScore)
    .slice(0, limit);
}

function pushCandidate(
  candidates: Map<string, SuggestionCandidate>,
  candidate: SuggestionCandidate,
) {
  const existing = candidates.get(candidate.sourceKey);

  if (!existing || existing.positionScore < candidate.positionScore) {
    candidates.set(candidate.sourceKey, candidate);
  }
}

function buildPairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join(":");
}
