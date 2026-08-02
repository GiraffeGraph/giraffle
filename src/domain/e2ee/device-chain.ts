import type { E2eeCryptoProvider } from "./crypto-provider";
import {
  RECORD_HASH_BYTES,
  bytesEqual,
  hashSignedSyncRecord,
  zeroRecordHash,
  type SignedSyncRecordV1,
} from "./sync-record";

export interface DeviceChainState {
  deviceId: string;
  sequence: number;
  head: Uint8Array;
}

export class DeviceChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceChainError";
  }
}

export function createDeviceChainState(deviceId: string): DeviceChainState {
  if (!deviceId) {
    throw new DeviceChainError("Device ID is required");
  }

  return {
    deviceId,
    sequence: 0,
    head: zeroRecordHash(),
  };
}

/**
 * Advances one device's signed hash chain. Signature verification must happen
 * before this function; this function owns only continuity and head evolution.
 */
export function advanceDeviceChain(
  crypto: E2eeCryptoProvider,
  state: DeviceChainState,
  record: SignedSyncRecordV1,
): DeviceChainState {
  if (state.head.length !== RECORD_HASH_BYTES) {
    throw new DeviceChainError("Stored device-chain head has an invalid length");
  }
  if (record.deviceId !== state.deviceId) {
    throw new DeviceChainError("Record belongs to a different device chain");
  }
  if (record.deviceSequence !== state.sequence + 1) {
    throw new DeviceChainError(
      `Expected device sequence ${state.sequence + 1}, received ${record.deviceSequence}`,
    );
  }
  if (!bytesEqual(record.previousRecordHash, state.head)) {
    throw new DeviceChainError("Record previous hash does not match device head");
  }

  return {
    deviceId: state.deviceId,
    sequence: record.deviceSequence,
    head: hashSignedSyncRecord(crypto, record),
  };
}
