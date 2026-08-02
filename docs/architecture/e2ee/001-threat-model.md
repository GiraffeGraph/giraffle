# ADR-001: Threat Model

Status: **Accepted**

## Security objective

An attacker who obtains the server database, file storage, backup media, reverse-proxy access, or authenticated ciphertext must not recover private vault content without a client-held unlock factor.

## Protected assets

- Note titles, bodies, icons, tags, and folder names
- Tiptap/Yjs document updates
- Excalidraw elements and app state
- Tasks, due dates, kanban, matrix, and calendar data
- Search and graph projections
- Private attachment content, names, and MIME metadata where practical
- Vault root keys, content keys, recovery secrets, and device private keys
- Decrypted content submitted to AI tools

## Adversaries

| Adversary | Expected protection |
| --- | --- |
| Stolen PostgreSQL dump | Confidentiality + integrity |
| Stolen object-store bucket | Confidentiality + integrity |
| Passive network observer | TLS plus application-layer ciphertext |
| Server administrator reading storage | No note plaintext or vault key |
| Attacker with an auth token only | Cannot forge valid signed device records |
| Lost locked phone | SQLCipher + hardware-backed key protection |
| Revoked device | Cannot submit or decrypt future key epochs |
| Malicious sync server | Cannot forge valid content; may replay, omit, fork, or delete records |
| Compromised unlocked client | Out of scope; plaintext is available to that client |
| Malicious client update | Out of scope for that client |

## Confidentiality boundary

The server may observe:

- account and device identifiers
- IP address and request timing
- server-assigned sequence numbers
- ciphertext size
- opaque object locators and their update frequency
- key epoch and protocol version
- encrypted blob size

The server must not receive semantic object type, real object ID, title, folder path, due date, graph edge, search token, plaintext hash, or plaintext MIME/file name.

An opaque locator is computed with keyed BLAKE2b-256 over a domain-separated vault/object identifier so the server can group checkpoints without learning the underlying identifier. This still leaks that multiple records affect the same object.

## Integrity and freshness

AEAD detects ciphertext modification but does not detect all omission or rollback attacks. The protocol therefore adds:

- monotonically increasing per-device sequence numbers
- an Ed25519 signature over canonical record headers and ciphertext
- a per-device previous-record hash chain
- locally retained last-seen device heads
- server cursor acknowledgements

A malicious server can indefinitely partition devices and present different valid histories. Full equivocation resistance would require an external transparency/gossip channel and is not a v1 requirement. Devices must detect the fork when conflicting signed heads are eventually observed.

## Web-client limitation

A server that controls delivered HTML/JavaScript can replace the web client with code that captures an unlock passphrase. Controls such as CSP, no third-party scripts, immutable release assets, reproducible builds, and a separate static origin reduce risk but do not create the same trust boundary as a signed mobile binary.

Security claims must therefore distinguish:

- **storage-zero-knowledge:** server storage and backups contain no plaintext
- **active-server resistance:** strongest on signed clients, limited on server-delivered web clients

## Explicit disclosure boundaries

The following operations intentionally leave the private-vault boundary:

- publishing a note
- exporting decrypted data
- copying content to another application
- sending selected plaintext to an external MCP integration
- rendering a remote preview that requires plaintext

Every disclosure must be user initiated, scoped, and visible. Plaintext must not be written to server logs or analytics.

## Non-goals

- Hiding all network metadata
- Protecting an unlocked compromised endpoint
- Guaranteed availability against the self-hosted server
- Anonymous accounts
- Multi-user collaborative sharing in protocol v1
- Server-side search over encrypted content
