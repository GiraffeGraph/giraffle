import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import {
  chooseGoogleCalendarCredentials,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  googleCalendarStatus,
  type GoogleCalendarStatus,
} from "@/calendar/googleCalendarBridge";
import { resetGoogleCalendarSync, syncGoogleCalendar, type GoogleCalendarSyncResult } from "@/calendar/googleCalendarSync";
import { Button, DividerRow, Icon } from "@/components/ui/primitives";
import { useTheme } from "@/design/ThemeProvider";
import { spacing, typography } from "@/design/tokens";
import { useApp } from "@/state/AppProvider";

const summary = (result: GoogleCalendarSyncResult) => {
  const changes = result.imported + result.updated + result.exported + result.removed;
  if (!changes) return "Up to date";
  return [
    result.imported ? `${result.imported} imported` : null,
    result.updated ? `${result.updated} updated` : null,
    result.exported ? `${result.exported} exported` : null,
    result.removed ? `${result.removed} removed` : null,
  ].filter(Boolean).join(" · ");
};

export function GoogleCalendarSection() {
  const { colors } = useTheme();
  const { snapshot, run } = useApp();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [busy, setBusy] = useState<"configure" | "connect" | "disconnect" | "sync" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => setStatus(await googleCalendarStatus());
  useEffect(() => {
    let active = true;
    void googleCalendarStatus()
      .then((value) => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({ supported: false, configured: false, connected: false }); });
    return () => { active = false; };
  }, []);

  const action = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      await task();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Calendar action failed");
    } finally {
      setBusy(null);
    }
  };

  if (!status?.supported) return null;

  return (
    <View>
      <Text style={[typography.label, styles.sectionLabel, { color: colors.faint }]}>Your Google Calendar</Text>
      {!status.configured ? (
        <View style={styles.setup}>
          <View style={styles.actions}>
            <Button label="Google setup" icon="open-outline" onPress={() => void Linking.openURL("https://console.cloud.google.com/apis/credentials")} />
            <Button
              label={busy === "configure" ? "Importing…" : "Import OAuth JSON"}
              icon="download-outline"
              tone="accent"
              disabled={busy !== null}
              onPress={() => void action("configure", async () => { await chooseGoogleCalendarCredentials(); })}
            />
          </View>
        </View>
      ) : status.connected ? (
        <>
          <DividerRow>
            <Icon name="calendar-outline" color={colors.accent} />
            <View style={styles.copy}>
              <Text style={[typography.body, { color: colors.text }]}>Your primary calendar</Text>
              <Text style={[typography.caption, { color: colors.muted }]}>{message ?? "Connected on this Mac"}</Text>
            </View>
          </DividerRow>
          <View style={styles.actions}>
            <Button
              label={busy === "sync" ? "Syncing…" : "Sync now"}
              icon="sync-outline"
              tone="accent"
              disabled={busy !== null}
              onPress={() => void action("sync", async () => setMessage(summary(await syncGoogleCalendar(snapshot.pages, run))))}
            />
            <Button
              label={busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              disabled={busy !== null}
              onPress={() => void action("disconnect", async () => {
                await disconnectGoogleCalendar();
                await resetGoogleCalendarSync();
              })}
            />
          </View>
        </>
      ) : (
        <>
          <DividerRow onPress={() => void action("connect", connectGoogleCalendar)}>
            <Icon name="calendar-outline" color={colors.faint} />
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{busy === "connect" ? "Connecting…" : "Connect your Google Calendar"}</Text>
            <Icon name="chevron-forward" size={15} color={colors.faint} />
          </DividerRow>
          <View style={styles.actions}>
            <Button label="Change setup" disabled={busy !== null} onPress={() => void action("configure", async () => { await chooseGoogleCalendarCredentials(); })} />
          </View>
        </>
      )}
      {error ? <Text accessibilityLiveRegion="assertive" style={[typography.caption, styles.feedback, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginTop: spacing.xxl, marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.6 },
  setup: { gap: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingTop: spacing.xs },
  copy: { flex: 1, gap: spacing.xxs },
  feedback: { paddingTop: spacing.sm },
});
