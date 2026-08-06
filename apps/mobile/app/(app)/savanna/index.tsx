import { router } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, EmptyState, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

export default function Savanna() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const create = () => {
    void run((repository) => repository.createCanvas())
      .then((id) => router.push(`/savanna/${id}`))
      .catch(() => undefined);
  };
  const confirmDelete = (id: string, title: string) => {
    Alert.alert("Delete map?", `“${title}” will no longer be available.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void run((repository) => repository.deleteCanvas(id)),
      },
    ]);
  };

  return (
    <>
      <ScreenTopbar
        title="Savanna"
        action={<Button label="Map" icon="add" tone="accent" onPress={create} />}
      />
      <Page>
      {snapshot.canvases.length === 0 ? (
        <EmptyState
          icon="map-outline"
          title="Start with a map"
          body="Create a map and place your pages on it."
          action={<Button label="Create map" tone="accent" onPress={create} />}
        />
      ) : (
        <View style={[styles.list, { borderTopColor: colors.border }]}>
          {snapshot.canvases.map((canvas) => (
            <DividerRow key={canvas.id}>
              <Icon name="map-outline" color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[typography.title, { color: colors.text }]}>
                  {canvas.title}
                </Text>
                <Text style={[typography.caption, { color: colors.muted }]}>
                  {canvas.elements.filter((element) => !element.isDeleted).length} elements · edited{" "}
                  {new Date(canvas.updatedAt).toLocaleDateString()}
                </Text>
              </View>
              <Button label="Open" onPress={() => router.push(`/savanna/${canvas.id}`)} />
              <Button
                icon="trash-outline"
                tone="danger"
                accessibilityLabel="Delete map"
                onPress={() => confirmDelete(canvas.id, canvas.title)}
              />
            </DividerRow>
          ))}
        </View>
      )}
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: StyleSheet.hairlineWidth },
});
