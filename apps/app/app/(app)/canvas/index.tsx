import type { Canvas as CanvasModel, CanvasElement } from "@giraffle/domain";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, Icon } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const PREVIEW_HEIGHT = 138;
const PREVIEW_PADDING = 14;

const numeric = (element: CanvasElement, key: string, fallback = 0) => {
  const value = element[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const paint = (element: CanvasElement, key: string, fallback: string) => {
  const value = element[key];
  return typeof value === "string" && value ? value : fallback;
};

const liveElements = (elements: CanvasElement[]) =>
  elements.filter((element) => !element.isDeleted);

function CanvasPreview({ elements }: { elements: CanvasElement[] }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const live = useMemo(() => liveElements(elements), [elements]);
  const bounds = useMemo(() => {
    if (!live.length) return null;
    const minX = Math.min(...live.map((element) => numeric(element, "x")));
    const minY = Math.min(...live.map((element) => numeric(element, "y")));
    const maxX = Math.max(
      ...live.map((element) => numeric(element, "x") + Math.max(numeric(element, "width"), 8)),
    );
    const maxY = Math.max(
      ...live.map((element) => numeric(element, "y") + Math.max(numeric(element, "height"), 8)),
    );
    return { minX, minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }, [live]);

  const scale =
    bounds && width
      ? Math.min(
          (width - PREVIEW_PADDING * 2) / bounds.width,
          (PREVIEW_HEIGHT - PREVIEW_PADDING * 2) / bounds.height,
          1,
        )
      : 1;
  const sceneWidth = bounds ? bounds.width * scale : 0;
  const sceneHeight = bounds ? bounds.height * scale : 0;
  const offsetX = (width - sceneWidth) / 2;
  const offsetY = (PREVIEW_HEIGHT - sceneHeight) / 2;

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[
        styles.preview,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {!live.length ? (
        <Icon name="map-outline" size={22} color={colors.faint} />
      ) : width && bounds ? (
        live.slice(0, 80).map((element) => {
          const x = offsetX + (numeric(element, "x") - bounds.minX) * scale;
          const y = offsetY + (numeric(element, "y") - bounds.minY) * scale;
          const itemWidth = Math.max(numeric(element, "width", 8) * scale, 2);
          const itemHeight = Math.max(numeric(element, "height", 8) * scale, 2);
          const angle = numeric(element, "angle");
          const stroke = paint(element, "strokeColor", colors.muted);
          const background = paint(element, "backgroundColor", "transparent");
          const text =
            typeof element.text === "string"
              ? element.text
              : element.customData?.giraffleManagedText;

          if (element.type === "text" || text) {
            return (
              <Text
                key={element.id}
                numberOfLines={2}
                style={[
                  styles.previewText,
                  {
                    left: x,
                    top: y,
                    width: itemWidth,
                    minHeight: itemHeight,
                    color: stroke,
                    fontSize: Math.max(6, Math.min(numeric(element, "fontSize", 16) * scale, 12)),
                    transform: angle ? [{ rotate: `${angle}rad` }] : undefined,
                  },
                ]}
              >
                {text}
              </Text>
            );
          }

          if (element.type === "line" || element.type === "arrow") {
            return (
              <View
                key={element.id}
                style={[
                  styles.previewLine,
                  {
                    left: x,
                    top: y + itemHeight / 2,
                    width: itemWidth,
                    backgroundColor: stroke,
                    transform: angle ? [{ rotate: `${angle}rad` }] : undefined,
                  },
                ]}
              />
            );
          }

          const diamond = element.type === "diamond";
          return (
            <View
              key={element.id}
              style={[
                styles.previewShape,
                {
                  left: x,
                  top: y,
                  width: itemWidth,
                  height: itemHeight,
                  borderColor: stroke,
                  backgroundColor: background === "transparent" ? "transparent" : background,
                  borderRadius: element.type === "ellipse" ? 999 : radii.xs,
                  transform:
                    diamond || angle
                      ? [{ rotate: `${angle + (diamond ? Math.PI / 4 : 0)}rad` }]
                      : undefined,
                },
              ]}
            />
          );
        })
      ) : null}
    </View>
  );
}

function CanvasCard({
  canvas,
  onDelete,
}: {
  canvas: CanvasModel;
  onDelete(): void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const showDelete = Platform.OS !== "web" || hovered;

  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={styles.card}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${canvas.title}`}
        onPress={() => router.push(`/canvas/${canvas.id}`)}
        style={({ pressed }) => [
          styles.cardLink,
          { backgroundColor: pressed || hovered ? colors.hover : "transparent" },
        ]}
      >
        <CanvasPreview elements={canvas.elements} />
        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={[typography.title, { color: colors.text, flex: 1 }]}>
            {canvas.title}
          </Text>
        </View>
      </Pressable>
      {showDelete ? (
        <View style={styles.delete}>
          <Button
            icon="trash-outline"
            tone="danger"
            accessibilityLabel={`Delete ${canvas.title}`}
            onPress={onDelete}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function CanvasList() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const confirm = useConfirm();
  const create = () => {
    void run((repository) => repository.createCanvas())
      .then((id) => router.push(`/canvas/${id}`))
      .catch(() => undefined);
  };
  const confirmDelete = (id: string, title: string) => {
    void confirm({
      title: "Delete canvas?",
      body: `“${title}” will no longer be available.`,
      confirmLabel: "Delete",
      tone: "danger",
    }).then((ok) => {
      if (ok) void run((repository) => repository.deleteCanvas(id)).catch(() => undefined);
    });
  };

  return (
    <>
      <ScreenTopbar
        title="Canvas"
        action={
          <Button
            icon="add"
            accessibilityLabel="Create canvas"
            onPress={create}
          />
        }
      />
      <Page wide>
        {snapshot.canvases.length ? (
          <View style={styles.grid}>
            {snapshot.canvases.map((canvas) => (
              <CanvasCard
                key={canvas.id}
                canvas={canvas}
                onDelete={() => confirmDelete(canvas.id, canvas.title)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Icon name="map-outline" size={22} color={colors.faint} />
            <Button label="Create canvas" onPress={create} />
          </View>
        )}
      </Page>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  card: {
    flexBasis: "46%",
    flexGrow: 1,
    minWidth: 260,
    position: "relative",
  },
  cardLink: {
    padding: spacing.xs,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  preview: {
    height: PREVIEW_HEIGHT,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  previewShape: {
    position: "absolute",
    borderWidth: 1,
    opacity: 0.82,
  },
  previewLine: {
    position: "absolute",
    height: 1,
    opacity: 0.82,
  },
  previewText: {
    position: "absolute",
    lineHeight: 13,
    overflow: "hidden",
  },
  cardFooter: {
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  delete: { position: "absolute", top: spacing.sm, right: spacing.sm },
  empty: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
});
