# E2EE Protocol Compatibility Vectors

`e2ee-v1.json` and `sync-record-v1.json` are durable protocol fixtures, not snapshots to regenerate when a test fails.

Every supported crypto provider must produce exactly these bytes for the same inputs:

- web/Node `libsodium-wrappers-sumo`
- React Native `react-native-libsodium`
- any future migration or recovery utility

The sync-record fixture additionally locks deterministic CBOR, AAD binding, object-locator derivation, ciphertext, signature, and record-hash bytes. The primitive fixture also locks sealed-box opening and the printable recovery-code representation/checksum.

A changed vector is a protocol change and requires:

1. a new suite or protocol version;
2. an architecture review;
3. old-vector decrypt/verify support;
4. migration and rollback tests;
5. explicit release notes.

The Argon2id vector intentionally uses 8 MiB and two operations to keep automated tests fast. It proves interoperability only. Production passphrase wrappers must use a separately benchmarked policy with materially stronger parameters; the current architecture baseline starts from RFC 9106's 64 MiB recommendation.

The fixture contains deterministic private-key material and is public test data. It must never be reused by a real vault or device.
