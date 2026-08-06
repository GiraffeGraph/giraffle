import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode as decodeCbor, encode as encodeCbor } from "cborg";
import { decrypt, derivePassphraseKey, encrypt, hash, randomBytes, zeroize } from "../crypto/nativeCrypto";
import { decodeKey, encodeKey } from "./keyStore";

const WRAPPER_KEY = "giraffle.passphrase-wrapper.v1";
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
interface StoredWrapper { version: 1; vaultId: string; salt: string; nonce: string; ciphertext: string; operations: 2; memoryBytes: number }
function toBase32(bytes: Uint8Array): string { let bits=0,value=0,result=""; for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=RECOVERY_ALPHABET[(value>>>(bits-5))&31];bits-=5;}}if(bits>0)result+=RECOVERY_ALPHABET[(value<<(5-bits))&31];return result; }
export function createRecoveryCode(): { code: string; secret: Uint8Array } { const secret=randomBytes(32); const checksum=hash(encodeCbor(["giraffle-recovery-code",1,secret])).slice(0,5); const payload=`${toBase32(secret)}${toBase32(checksum)}`; return { secret, code:`GIR1-${payload.match(/.{1,4}/g)?.join("-") ?? payload}` }; }
export async function createPassphraseWrapper(vaultId:string,passphrase:string,vaultRootKey:Uint8Array):Promise<void>{const salt=randomBytes(16);const key=await derivePassphraseKey(passphrase,salt);const aad=encodeCbor({protocolVersion:1,wrapperVersion:1,suiteId:"xchacha20poly1305-argon2id-ed25519-v1",vaultId,operations:2,memoryBytes:64*1024*1024});const payload=encodeCbor({vaultId,protocolVersion:1,vaultRootKey});const wrapped=encrypt(payload,aad,key);const stored:StoredWrapper={version:1,vaultId,salt:encodeKey(salt),nonce:encodeKey(wrapped.nonce),ciphertext:encodeKey(wrapped.ciphertext),operations:2,memoryBytes:64*1024*1024};await AsyncStorage.setItem(WRAPPER_KEY,JSON.stringify(stored));zeroize(key,salt,payload);}
export async function verifyPassphrase(passphrase:string,expectedVaultRootKey:Uint8Array):Promise<boolean>{const raw=await AsyncStorage.getItem(WRAPPER_KEY);if(!raw)return false;const stored=JSON.parse(raw) as StoredWrapper;const salt=decodeKey(stored.salt);const key=await derivePassphraseKey(passphrase,salt,stored.operations,stored.memoryBytes);const aad=encodeCbor({protocolVersion:1,wrapperVersion:1,suiteId:"xchacha20poly1305-argon2id-ed25519-v1",vaultId:stored.vaultId,operations:stored.operations,memoryBytes:stored.memoryBytes});try{const opened=decrypt(decodeKey(stored.ciphertext),aad,key,decodeKey(stored.nonce));const decoded=decodeCbor(opened) as {vaultRootKey?:Uint8Array};return decoded.vaultRootKey instanceof Uint8Array && decoded.vaultRootKey.every((byte,index)=>byte===expectedVaultRootKey[index]);}catch{return false;}finally{zeroize(key,salt);}}
/**
 * The wrapper lives in the app container while the keys live in the keychain,
 * which survives an uninstall. Without this check a reinstall would show an
 * unlock screen for a vault whose data is gone, and no passphrase would work.
 */
export async function hasVaultWrapper():Promise<boolean>{return (await AsyncStorage.getItem(WRAPPER_KEY))!==null;}
export async function clearVaultWrapper():Promise<void>{await AsyncStorage.removeItem(WRAPPER_KEY);}
