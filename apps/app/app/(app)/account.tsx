import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { DividerRow, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { radii, spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";
import { version } from "../../package.json";

const accountLinks = [
  { href: "/archive", label: "Archive", icon: "archive-outline" },
  { href: "/settings", label: "Settings", icon: "settings-outline" },
  { href: "/help", label: "Help", icon: "help-circle-outline" },
] as const;

export default function Account() {
  const { colors } = useTheme();
  const { lock } = useApp();

  return (
    <>
      <ScreenTopbar title="Account" />
      <Page>

      <View style={styles.identity}>
        <Image source={require("../../assets/brand-mark.png")} style={styles.logo} />
        <View style={styles.identityCopy}>
          <Text style={[typography.title, { color: colors.text }]}>Giraffle</Text>
          <Text style={[typography.caption, { color: colors.muted }]}>Ready to use</Text>
        </View>
      </View>

      <View>
        <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>
          Workspace
        </Text>
        {accountLinks.map((item) => (
          <DividerRow
            key={item.href}
            onPress={() => router.push(item.href as never)}
          >
            <Icon name={item.icon} size={16} color={colors.faint} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
              {item.label}
            </Text>
            <Icon name="chevron-forward" size={15} color={colors.faint} />
          </DividerRow>
        ))}
      </View>

      <View>
        <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>
          On this device
        </Text>
        <DividerRow onPress={() => void lock()}>
          <Icon name="lock-closed-outline" size={16} color={colors.faint} />
          <Text style={[typography.body, { color: colors.text, flex: 1 }]}>Lock</Text>
        </DividerRow>
      </View>

      <Text style={[typography.caption, styles.version, { color: colors.muted }]}>
        Version {version}
      </Text>
    </Page>
    </>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  logo: { width: 32, height: 32, borderRadius: radii.md },
  identityCopy: { gap: spacing.xxs },
  sectionLabel: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  version: { marginTop: "auto" },
});
