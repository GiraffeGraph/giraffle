import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { ScreenTopbar } from "@/components/shell/ScreenTopbar";
import { Page } from "@/components/ui/Page";
import { DividerRow, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
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
        {accountLinks.map((item) => (
          <DividerRow
            key={item.href}
            onPress={() => router.push(item.href as never)}
          >
            <Icon name={item.icon} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
              {item.label}
            </Text>
            <Icon name="chevron-forward" />
          </DividerRow>
        ))}
        <DividerRow onPress={() => void lock()}>
          <Icon name="lock-closed-outline" />
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
    paddingVertical: spacing.sm,
  },
  logo: { width: 44, height: 44, borderRadius: 11 },
  identityCopy: { gap: 2 },
  version: { marginTop: "auto" },
});
