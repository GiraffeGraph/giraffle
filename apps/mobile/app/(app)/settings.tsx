import { Alert, StyleSheet, Text, View } from "react-native";
import { AccessLockSection } from "@/components/settings/AccessLockSection";
import { DeviceConnectionSection } from "@/components/settings/DeviceConnectionSection";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { Button, DividerRow, Icon } from "@/components/ui/primitives";
import { useTheme, type ThemePreference } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const appearanceOptions: readonly {
  value: ThemePreference;
  label: string;
  icon: "phone-portrait-outline" | "sunny-outline" | "moon-outline";
}[] = [
  { value: "system", label: "Use device setting", icon: "phone-portrait-outline" },
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
];

export default function Settings() {
  const { colors, preference, setPreference } = useTheme();
  const { lock, wipe } = useApp();

  return (
    <>
      <ScreenTopbar title="Settings" />
      <Page>

      <View>
        <Text style={[typography.label, styles.sectionLabel, { color: colors.muted }]}>Appearance</Text>
        {appearanceOptions.map((option) => (
          <DividerRow
            key={option.value}
            onPress={() => setPreference(option.value)}
          >
            <Icon name={option.icon} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
              {option.label}
            </Text>
            {preference === option.value ? (
              <Icon name="checkmark" color={colors.accent} />
            ) : null}
          </DividerRow>
        ))}
      </View>

      <AccessLockSection />

      <DeviceConnectionSection />

      <View style={styles.safety}>
        <Text style={[typography.label, styles.sectionLabel, { color: colors.muted }]}>On this device</Text>
        <Button
          label="Lock Giraffle"
          icon="lock-closed-outline"
          onPress={() => void lock()}
        />
        <Button
          label="Delete all local data"
          icon="trash-outline"
          tone="danger"
          onPress={() =>
            Alert.alert(
              "Delete all local data?",
              "This removes the encrypted vault, quick PIN, and unsynced changes from this device. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void wipe() },
              ],
            )
          }
        />
      </View>
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginBottom: spacing.sm },
  safety: { gap: spacing.sm },
});
