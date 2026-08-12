import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
}

export default function Search() {
  const { colors } = useTheme();
  const { repository } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    // Bumping first invalidates any in-flight request when the query clears.
    const id = ++requestId.current;
    const normalized = query.trim();
    if (!normalized || !repository) return;

    const timer = setTimeout(() => {
      setSearching(true);
      setResults([]);
      void repository
        .search(normalized)
        .then((next) => {
          if (requestId.current !== id) return;
          setResults(next);
          setError(null);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setResults([]);
          setError("Search could not be completed.");
        })
        .finally(() => {
          if (requestId.current === id) setSearching(false);
        });
    }, 180);

    return () => clearTimeout(timer);
  }, [query, repository]);

  // An empty query has no results by definition, so derive rather than store it.
  const normalizedQuery = query.trim();
  const visibleResults = normalizedQuery ? results : [];
  const isSearching = normalizedQuery ? searching : false;

  return (
    <>
      <ScreenTopbar title="Search" />
      <Page>
      <View style={[styles.search, { borderBottomColor: colors.border }]}>
        <Icon name="search-outline" />
        <TextInput
          autoFocus
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setError(null);
          }}
          placeholder="Search pages and content"
          placeholderTextColor={colors.faint}
          style={[typography.body, { color: colors.text, flex: 1 }]}
        />
      </View>
      {isSearching ? (
        <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.muted }]}>
          Searching…
        </Text>
      ) : null}
      {error ? <Text style={[typography.body, { color: colors.danger }]}>{error}</Text> : null}
      {!isSearching && !error && normalizedQuery && !visibleResults.length ? (
        <EmptyState
          icon="search-outline"
          title="No matches"
          body="Try fewer terms. Search covers page titles and local document text."
        />
      ) : (
        <View>
          {visibleResults.map((result) => (
            <DividerRow
              key={result.id}
              onPress={() => {
                router.push(`/pages/${result.id}`);
              }}
            >
              <Icon name="document-text-outline" />
              <View style={{ flex: 1 }}>
                <Text style={[typography.title, { color: colors.text }]}>{result.title}</Text>
                <Text numberOfLines={2} style={[typography.caption, { color: colors.secondary }]}>
                  {result.snippet}
                </Text>
              </View>
              <Icon name="chevron-forward" />
            </DividerRow>
          ))}
        </View>
      )}
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 48,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    borderRadius: radii.xs,
  },
});
