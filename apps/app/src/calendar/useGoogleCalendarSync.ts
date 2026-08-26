import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Page } from "@giraffle/domain";
import type { VaultRepository } from "@/infrastructure/database/repository";
import { googleCalendarStatus } from "./googleCalendarBridge";
import { syncGoogleCalendar, type GoogleCalendarSyncResult } from "./googleCalendarSync";

type RunRepository = <T>(action: (repository: VaultRepository) => Promise<T>) => Promise<T>;

const calendarFingerprint = (page: Page) => [
  page.id,
  page.title,
  page.scheduledAt,
  page.durationMinutes,
  page.calendarColor,
  page.description,
  page.isArchived,
].join("\u001f");

export function useGoogleCalendarSync(pages: readonly Page[], run: RunRepository) {
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAutomaticSignature = useRef<string | null>(null);
  const signature = useMemo(
    () => pages.map(calendarFingerprint).sort().join("\u001e"),
    [pages],
  );

  useEffect(() => {
    let active = true;
    void googleCalendarStatus()
      .then((status) => { if (active) setConnected(status.connected); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const syncNow = useCallback(async (): Promise<GoogleCalendarSyncResult> => {
    setSyncing(true);
    setError(null);
    try {
      return await syncGoogleCalendar(pages, run);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Google Calendar sync failed";
      setError(message);
      throw cause;
    } finally {
      setSyncing(false);
    }
  }, [pages, run]);

  useEffect(() => {
    if (!connected || signature === lastAutomaticSignature.current) return;
    const timer = setTimeout(() => {
      lastAutomaticSignature.current = signature;
      void syncNow().catch(() => { lastAutomaticSignature.current = null; });
    }, 1_500);
    return () => clearTimeout(timer);
  }, [connected, signature, syncNow]);

  return { connected, syncing, error, syncNow };
}
