import { createSodiumCryptoProvider } from "@giraffle/protocol/src/sodium-provider";
import {
  type E2eeCryptoProvider,
} from "@giraffle/protocol";

let cryptoProvider: Promise<E2eeCryptoProvider> | null = null;

/**
 * Signature verification is the only cryptography this relay performs, and the
 * provider is expensive to construct, so every route shares one instance.
 */
export function getCryptoProvider(): Promise<E2eeCryptoProvider> {
  cryptoProvider ??= createSodiumCryptoProvider();
  return cryptoProvider;
}
