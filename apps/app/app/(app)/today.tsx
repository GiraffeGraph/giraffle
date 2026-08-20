import { dayKey, parseDue, type Page as PageModel } from "@giraffle/domain";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import {
  ThoughtField,
  type ThoughtDestination,
} from "@/components/today/ThoughtField";
import { Page } from "@/components/ui/Page";
import { Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

export default function Today() {
  const { snapshot, run } = useApp();
  const today = dayKey(new Date());

  const { scheduled, overdue, inProgress, captures } = useMemo(() => {
    const family = new Map(snapshot.states.map((state) => [state.id, state.family]));
    // A custom open state is a stage deliberately chosen by the user. It reads
    // as work in flight without depending on the state's custom title.
    const staged = new Set(
      snapshot.states
        .filter((state) => state.family === "open" && !state.isDefault)
        .map((state) => state.id),
    );
    const pages = snapshot.pages.filter((page) => !page.isArchived);
    const open = pages.filter((page) => family.get(page.stateId) === "open");

    return {
      scheduled: open.filter((page) => parseDue(page.scheduledAt)?.day === today),
      overdue: open.filter((page) => {
        const due = parseDue(page.scheduledAt)?.day;
        return due ? due < today : false;
      }),
      inProgress: open.filter((page) => staged.has(page.stateId)),
      captures: snapshot.inboxPageId
        ? pages.filter((page) => page.parentId === snapshot.inboxPageId)
        : [],
    };
  }, [snapshot, today]);

  const complete = useCallback(
    (page: PageModel) => {
      const done =
        snapshot.states.find((state) => state.family === "done" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "done");
      if (done) void run((repository) => repository.updatePage(page.id, { stateId: done.id }));
    },
    [run, snapshot.states],
  );

  const capture = useCallback(
    (title: string) => run((repository) => repository.createCapture(title)),
    [run],
  );

  const routeThought = useCallback(
    (page: PageModel, destination: ThoughtDestination) => {
      const open =
        snapshot.states.find((state) => state.family === "open" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "open");
      const forever =
        snapshot.states.find((state) => state.family === "forever" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "forever");
      const done =
        snapshot.states.find((state) => state.family === "done" && state.isDefault) ??
        snapshot.states.find((state) => state.family === "done");

      void run(async (repository) => {
        if (destination === "close") {
          if (done) await repository.updatePage(page.id, { stateId: done.id });
          await repository.archivePage(page.id);
          return;
        }

        // Leaving the field means the capture has been clarified and no longer
        // belongs under the Inbox system Page.
        await repository.movePage(page.id, null);

        if (destination === "focus") {
          await repository.updatePage(page.id, {
            ...(open ? { stateId: open.id } : {}),
            priority: "do",
            scheduledAt: today,
          });
          return;
        }
        if (destination === "later") {
          await repository.updatePage(page.id, {
            ...(open ? { stateId: open.id } : {}),
            priority: "schedule",
            scheduledAt: null,
            durationMinutes: null,
          });
          return;
        }
        await repository.updatePage(page.id, {
          ...(forever ? { stateId: forever.id } : {}),
          priority: null,
          scheduledAt: null,
          durationMinutes: null,
        });
      }).catch(() => undefined);
    },
    [run, snapshot.states, today],
  );

  const hasPlannedWork = scheduled.length > 0 || overdue.length > 0 || inProgress.length > 0;

  return (
    <>
      <ScreenTopbar title="Today" />
      <Page>
        <ThoughtField
          pages={captures}
          onCapture={capture}
          onOpen={(pageId) => router.push(`/pages/${pageId}`)}
          onRoute={routeThought}
        />

        {hasPlannedWork ? (
          <View style={styles.sections}>
            {scheduled.length ? (
              <FocusSection
                title="Today"
                icon="sunny-outline"
                pages={scheduled}
                onComplete={complete}
              />
            ) : null}
            {overdue.length ? (
              <FocusSection
                title="Overdue"
                icon="time-outline"
                pages={overdue}
                tone="danger"
                onComplete={complete}
              />
            ) : null}
            {inProgress.length ? (
              <FocusSection
                title="In progress"
                icon="pulse-outline"
                pages={inProgress}
                onComplete={complete}
              />
            ) : null}
          </View>
        ) : null}
      </Page>
    </>
  );
}

function FocusSection({
  title,
  icon,
  pages,
  onComplete,
  tone,
}: {
  title: string;
  icon: "sunny-outline" | "time-outline" | "pulse-outline";
  pages: PageModel[];
  onComplete(page: PageModel): void;
  tone?: "danger";
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={tone ? colors.danger : colors.accent} />
        <Text style={[typography.title, { color: colors.text, flex: 1 }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.muted }]}>{pages.length}</Text>
      </View>
      <View style={[styles.focusList, { borderTopColor: colors.border }]}>
        {pages.map((page) => (
          <View key={page.id} style={[styles.focusRow, { borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`Complete ${page.title}`}
              onPress={() => onComplete(page)}
              style={[styles.check, { borderColor: colors.borderStrong }]}
            >
              <View />
            </Pressable>
            <Pressable
              onPress={() => router.push(`/pages/${page.id}`)}
              style={styles.focusCopy}
            >
              <Text
                numberOfLines={1}
                style={[typography.body, { color: colors.text, fontWeight: "600" }]}
              >
                {page.title || "Untitled"}
              </Text>
              <Text style={[typography.caption, { color: colors.muted }]}>
                {page.scheduledAt?.includes("T") ? page.scheduledAt.slice(11) : "All day"}
                {page.durationMinutes ? ` · ${page.durationMinutes} min` : ""}
              </Text>
            </Pressable>
            <Icon name="chevron-forward" size={15} color={colors.faint} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: {
    width: "100%",
    maxWidth: 760,
    gap: spacing.xxl,
  },
  section: { gap: spacing.sm },
  sectionHead: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  focusList: { borderTopWidth: StyleSheet.hairlineWidth },
  focusRow: {
    minHeight: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radii.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  focusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
