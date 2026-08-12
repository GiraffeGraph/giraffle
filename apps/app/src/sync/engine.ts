import type { VaultRepository } from "@/infrastructure/database/repository";
import {
  listDevices,
  pullRecords,
  pushOutbox,
  type SyncConfiguration,
} from "@/infrastructure/sync/syncClient";

const PULL_PAGE_SIZE = 100;
// A vault this far behind is better served by a checkpoint than by an unbounded
// loop, so one run stops and the next one resumes from the stored cursor.
const MAX_PULL_PAGES = 500;

export interface SyncOutcome {
  pushed: number;
  applied: number;
  skipped: number;
  deferred: number;
  cursor: string;
  error: string | null;
}

export interface SyncEngine {
  run(): Promise<SyncOutcome>;
}

function emptyOutcome(cursor: string): SyncOutcome {
  return { pushed: 0, applied: 0, skipped: 0, deferred: 0, cursor, error: null };
}

/**
 * One exchange with the relay: publish what this device owes, then take
 * everything it has not seen and merge it locally. Every step is failure
 * tolerant on purpose — offline is the normal case, and a run that gives up
 * halfway must leave the vault exactly as usable as it was before.
 */
export function createSyncEngine(deps: {
  config: SyncConfiguration;
  vaultId: string;
  deviceId: string;
  repository: VaultRepository;
}): SyncEngine {
  let inFlight: Promise<SyncOutcome> | null = null;

  const exchange = async (): Promise<SyncOutcome> => {
    const outcome = emptyOutcome(await deps.repository.pullCursor());

    try {
      // Signature verification needs the other devices' public keys, so the
      // roster is refreshed before anything they signed is opened.
      await deps.repository.rememberDevices(await listDevices(deps.config, deps.vaultId));
      await deps.repository.ensureBootstrapSyncRecords();

      // A previous run may have received a record before its author was known,
      // or stopped after durably deferring it. Retry those ciphertexts before
      // advancing through newer relay records.
      const retried = await deps.repository.retryDeferredRecords();
      outcome.applied += retried.applied;
      outcome.skipped += retried.skipped;

      outcome.pushed = await pushOutbox(deps.config, {
        vaultId: deps.vaultId,
        repository: deps.repository,
      });

      for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
        const pulled = await pullRecords(deps.config, {
          vaultId: deps.vaultId,
          deviceId: deps.deviceId,
          after: outcome.cursor,
          limit: PULL_PAGE_SIZE,
        });

        for (const record of pulled.records) {
          // The repository advances the cursor in the same transaction that
          // applies the record, so a crash here resumes at the right place.
          const result = await deps.repository.applyRemoteRecord(
            record.encodedRecord,
            record.serverSeq,
          );
          outcome[result === "applied" ? "applied" : result === "skipped" ? "skipped" : "deferred"] += 1;
          outcome.cursor = record.serverSeq;
        }

        // `hasMore` is `records.length === limit`, so a full final page costs one
        // extra empty request. That empty page is the termination signal.
        if (!pulled.hasMore || pulled.records.length === 0) break;
      }

      // Newer records in this same pull may satisfy a deferred record's foreign
      // keys, so give the durable queue one more ordered pass before reporting.
      const recovered = await deps.repository.retryDeferredRecords();
      outcome.applied += recovered.applied;
      outcome.skipped += recovered.skipped;

      const unresolved = await deps.repository.deferredRecordSummary();
      outcome.deferred = unresolved.count;
      if (unresolved.count) {
        outcome.error = `${unresolved.count} encrypted change${unresolved.count === 1 ? " is" : "s are"} waiting${unresolved.reason ? `: ${unresolved.reason}` : ""}`;
        await deps.repository.recordSyncError(outcome.error);
      } else {
        await deps.repository.recordSyncSuccess();
      }
    } catch (cause) {
      outcome.error = cause instanceof Error ? cause.message : "Sync failed";
      await deps.repository.recordSyncError(outcome.error).catch(() => undefined);
    }

    return outcome;
  };

  return {
    run() {
      // A second caller joins the run already in flight rather than starting a
      // parallel one, which is what keeps a record from being applied twice.
      inFlight ??= exchange().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
