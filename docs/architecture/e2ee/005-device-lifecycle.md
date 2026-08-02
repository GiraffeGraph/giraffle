# ADR-005: Device Lifecycle and Recovery

Status: **Accepted flow**

## Device identity

Every installation creates:

- random device ID
- Ed25519 signing key pair
- X25519 agreement key pair for libsodium sealed-box transport
- local database key
- monotonic device sequence
- per-device hash-chain head

Private keys are generated and retained by the device secure-storage/crypto provider. Public keys and status are registered on the server.

An authenticated server session is necessary but not sufficient to submit sync records: records must also carry a valid signature from an active device.

## First device

1. Create account authentication credentials.
2. Generate Vault Root Key and initial content-key epoch locally.
3. Generate recovery secret and wrappers.
4. Store device-local wrappers in Keychain/Keystore.
5. Upload only public device keys and encrypted key wrappers.
6. Require the user to confirm recovery material before treating setup as complete.

## QR enrollment

1. New device authenticates to the account and generates an ephemeral pairing request containing its agreement public key, device public keys, and a short-lived server token.
2. The request is encoded in a QR code with a human-verifiable short authentication string.
3. Existing trusted device scans and displays the new device name/fingerprint.
4. Existing device seals the VRK payload to the new device's X25519 public key.
5. Existing device signs the complete outer authorization envelope with Ed25519; sealed-box encryption alone does not authenticate the sender.
6. New device downloads and decrypts the wrapper, then verifies a known vault sentinel before pulling all records.
7. Both devices record the updated device roster and signed heads.

The server must not substitute the QR public key. Pairing tokens are single-use, expire quickly, and are rate limited.

## Recovery enrollment

If no trusted device exists:

1. authenticate the account;
2. enter/scan the recovery secret locally;
3. download the recovery wrapper;
4. decrypt VRK and verify the vault sentinel;
5. register a fresh device identity;
6. rotate authentication sessions;
7. optionally rotate the content-key epoch if device loss is suspected.

A password-reset email does not decrypt a vault. Authentication recovery and encryption recovery are separate.

## Locking

- App lock removes unwrapped VRK/content keys from application state.
- Backgrounding starts a configurable lock timer.
- Biometric unlock releases a device wrapper; it does not replace recovery.
- After process death, keys must be unwrapped again.
- Decrypted editor/WebView state is destroyed on lock.

## Revocation

Revocation performs:

1. mark device revoked server-side;
2. revoke its auth sessions and push token;
3. reject future signatures from it;
4. create a new active content-key epoch;
5. distribute the new epoch only to active devices;
6. retain old epochs for historical decryption;
7. record a signed revocation event in the encrypted vault log.

Limits must be stated honestly: a device that previously decrypted data may retain plaintext and historical keys. Revocation provides future secrecy, not retroactive erasure.

## Device expiry

Offline-first clients may disappear for months. Automatic expiry must be explicit and conservative.

Suggested policy:

- active: acknowledged within 90 days
- stale: no acknowledgement for 90 days; blocks compaction but warns user
- expired: user-confirmed or policy-confirmed removal; no longer blocks compaction
- revoked: cryptographically excluded from future epochs

Exact durations are configuration, not protocol constants.

## Recovery-material handling

- Recovery secret is never uploaded as plaintext.
- UI offers printable text and QR with checksum.
- Clipboard copy warns and clears opportunistically; clipboard clearing is not a security guarantee.
- Screenshots are blocked on sensitive Android views where supported; iOS capture state is detected and warned.
- Recovery verification is tested before old device removal.

## Account deletion

Account deletion removes server ciphertext, wrappers, blobs, auth records, and push tokens after a clear retention policy. Local devices keep their local vault until the user explicitly deletes it. Server deletion cannot remotely prove secure deletion of all external backups; backup retention must be documented.
