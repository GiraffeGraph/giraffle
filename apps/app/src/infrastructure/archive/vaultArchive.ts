import { decodeCanonical,encodeCanonical,E2EE_CRYPTO_SUITE } from "@giraffle/protocol";
import { extractCanvasReferences,type Canvas,type Page,type PageCategory,type PageState } from "@giraffle/domain";
import { z } from "zod";
import { ARGON2ID_MEMORY_BYTES,ARGON2ID_OPERATIONS } from "../secure-storage/vaultKeys.contract";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";

const ARCHIVE_MAGIC="giraffle-vault-archive";
export const VAULT_ARCHIVE_VERSION=2;
export const MAX_VAULT_ARCHIVE_BYTES=256*1024*1024;
const crypto=vaultCryptoProvider;
const encoder=new TextEncoder();const decoder=new TextDecoder("utf-8",{fatal:true});

export interface VaultArchiveData{pages:Page[];states:PageState[];categories:PageCategory[];canvases:Canvas[]}
export interface VaultArchivePayload{archiveVersion:typeof VAULT_ARCHIVE_VERSION;exportedAt:number;sourceVaultId:string;data:VaultArchiveData}
export interface VaultArchiveSummary{exportedAt:number;sourceVaultId:string;pages:number;states:number;categories:number;canvases:number}

const id=z.string().min(1).max(256);const timestamp=z.number().int().nonnegative().safe();const position=z.string().min(1).max(512);
const document=z.object({type:z.literal("doc"),content:z.array(z.unknown()).max(500_000)}).passthrough();
const page=z.object({id,title:z.string().max(2_000_000),icon:z.string().max(256).nullable(),parentId:id.nullable(),position,stateId:id,categoryId:id.nullable(),priority:z.enum(["do","schedule","delegate","eliminate"]).nullable(),scheduledAt:z.string().max(64).nullable(),durationMinutes:z.number().int().positive().max(525_600).nullable(),description:z.string().max(2_000_000).nullable(),childView:z.enum(["list","category","priority"]),isPinned:z.boolean(),isArchived:z.boolean(),document,createdAt:timestamp,updatedAt:timestamp}).strict();
const state=z.object({id,title:z.string().max(220),family:z.enum(["forever","open","done"]),color:z.string().max(64).nullable(),icon:z.string().max(256).nullable(),position,isDefault:z.boolean()}).strict();
const category=z.object({id,parentId:id.nullable(),title:z.string().max(220),color:z.string().max(64).nullable(),position,stateIdOnEnter:id.nullable()}).strict();
const canvasElement=z.object({id,type:z.string().min(1).max(128),version:z.number().int().nonnegative().safe(),versionNonce:z.number().int().nonnegative().safe(),isDeleted:z.boolean()}).passthrough();
const canvas=z.object({id,title:z.string().max(2_000_000),elements:z.array(canvasElement).max(500_000),appState:z.record(z.string(),z.unknown()),createdAt:timestamp,updatedAt:timestamp}).strict();
const payloadSchema=z.object({archiveVersion:z.literal(VAULT_ARCHIVE_VERSION),exportedAt:timestamp,sourceVaultId:id,data:z.object({pages:z.array(page).max(500_000),states:z.array(state).max(10_000),categories:z.array(category).max(100_000),canvases:z.array(canvas).max(100_000)}).strict()}).strict();

interface Header{magic:typeof ARCHIVE_MAGIC;archiveVersion:typeof VAULT_ARCHIVE_VERSION;suite:typeof E2EE_CRYPTO_SUITE;kdf:{algorithm:"argon2id";salt:Uint8Array;opsLimit:typeof ARGON2ID_OPERATIONS;memLimitBytes:typeof ARGON2ID_MEMORY_BYTES}}
const header=(salt:Uint8Array):Header=>({magic:ARCHIVE_MAGIC,archiveVersion:VAULT_ARCHIVE_VERSION,suite:E2EE_CRYPTO_SUITE,kdf:{algorithm:"argon2id",salt,opsLimit:ARGON2ID_OPERATIONS,memLimitBytes:ARGON2ID_MEMORY_BYTES}});
function ids<T extends{id:string}>(items:readonly T[],label:string){const result=new Set<string>();for(const item of items){if(result.has(item.id))throw new Error(`Backup contains a duplicate ${label} id`);result.add(item.id);}return result;}
function validate(data:VaultArchiveData){
  const pageIds=ids(data.pages,"page"),stateIds=ids(data.states,"state"),categoryIds=ids(data.categories,"category"),canvasIds=ids(data.canvases,"canvas");void canvasIds;
  const parents=new Map(data.pages.map((item)=>[item.id,item.parentId]));
  for(const item of data.pages){if(item.parentId&&!pageIds.has(item.parentId))throw new Error(`Page ${item.id} refers to a missing parent`);if(!stateIds.has(item.stateId))throw new Error(`Page ${item.id} refers to a missing state`);if(item.categoryId&&!categoryIds.has(item.categoryId))throw new Error(`Page ${item.id} refers to a missing category`);const seen=new Set<string>();let current:string|null=item.id;while(current){if(seen.has(current))throw new Error("Backup contains a page cycle");seen.add(current);current=parents.get(current)??null;}}
  const categoriesById=new Map(data.categories.map((item)=>[item.id,item]));
  for(const item of data.categories){if(item.parentId&&!pageIds.has(item.parentId))throw new Error(`Category ${item.id} refers to a missing parent`);if(item.stateIdOnEnter&&!stateIds.has(item.stateIdOnEnter))throw new Error(`Category ${item.id} refers to a missing state`);}
  for(const item of data.pages){if(item.categoryId&&categoriesById.get(item.categoryId)?.parentId!==item.parentId)throw new Error(`Page ${item.id} has a category owned by another parent`);}
  for(const scene of data.canvases){ids(scene.elements,`element in canvas ${scene.id}`);for(const reference of extractCanvasReferences(scene.elements))if(!pageIds.has(reference.pageId))throw new Error(`Canvas ${scene.id} refers to a missing page`);}
}
function parse(plaintext:Uint8Array):VaultArchivePayload{let raw:unknown;try{raw=JSON.parse(decoder.decode(plaintext));}catch{throw new Error("Backup payload is not valid JSON");}const parsed=payloadSchema.safeParse(raw);if(!parsed.success)throw new Error("Backup payload contains invalid or unsupported data");const value=parsed.data as VaultArchivePayload;validate(value.data);return value;}
function envelope(encoded:Uint8Array){if(!encoded.length||encoded.length>MAX_VAULT_ARCHIVE_BYTES)throw new Error("Backup file size is invalid");let value:unknown;try{value=decodeCanonical(encoded);}catch{throw new Error("This is not a valid Giraffle backup");}const item=value as Record<string,unknown>;const kdf=item?.kdf as Record<string,unknown>|undefined;if(item?.magic!==ARCHIVE_MAGIC||item.archiveVersion!==VAULT_ARCHIVE_VERSION||item.suite!==E2EE_CRYPTO_SUITE||!kdf||kdf.algorithm!=="argon2id"||!(kdf.salt instanceof Uint8Array)||!(item.nonce instanceof Uint8Array)||!(item.ciphertext instanceof Uint8Array))throw new Error("This backup format is unsupported or damaged");return{header:header(kdf.salt),nonce:item.nonce,ciphertext:item.ciphertext};}
export function summarizeVaultArchive(payload:VaultArchivePayload):VaultArchiveSummary{return{exportedAt:payload.exportedAt,sourceVaultId:payload.sourceVaultId,pages:payload.data.pages.length,states:payload.data.states.length,categories:payload.data.categories.length,canvases:payload.data.canvases.length};}
export function createVaultArchive(data:VaultArchiveData,sourceVaultId:string,passphrase:string):Uint8Array{if(passphrase.length<12)throw new Error("Use at least 12 characters for the backup password");validate(data);const checked=payloadSchema.parse({archiveVersion:VAULT_ARCHIVE_VERSION,exportedAt:Date.now(),sourceVaultId,data});const plaintext=encoder.encode(JSON.stringify(checked));const salt=crypto.randomBytes(crypto.argon2idSaltBytes);const metadata=header(salt);const key=crypto.deriveArgon2idKey({password:passphrase,salt,outputLength:crypto.aeadKeyBytes,opsLimit:ARGON2ID_OPERATIONS,memLimitBytes:ARGON2ID_MEMORY_BYTES});try{const encrypted=crypto.encrypt({plaintext,additionalData:encodeCanonical(metadata),key});const encoded=encodeCanonical({...metadata,nonce:encrypted.nonce,ciphertext:encrypted.ciphertext});if(encoded.length>MAX_VAULT_ARCHIVE_BYTES)throw new Error("Backup is too large to export");return encoded;}finally{crypto.clear(key);crypto.clear(plaintext);}}
export function openVaultArchive(encoded:Uint8Array,passphrase:string):VaultArchivePayload{const item=envelope(encoded);const key=crypto.deriveArgon2idKey({password:passphrase,salt:item.header.kdf.salt,outputLength:crypto.aeadKeyBytes,opsLimit:ARGON2ID_OPERATIONS,memLimitBytes:ARGON2ID_MEMORY_BYTES});let plaintext:Uint8Array;try{plaintext=crypto.decrypt({ciphertext:item.ciphertext,additionalData:encodeCanonical(item.header),key,nonce:item.nonce});}catch{throw new Error("Backup password is incorrect or the file is damaged");}finally{crypto.clear(key);}try{return parse(plaintext);}finally{crypto.clear(plaintext);}}
