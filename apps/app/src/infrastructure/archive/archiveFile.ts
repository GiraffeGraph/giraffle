import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MAX_VAULT_ARCHIVE_BYTES } from "./vaultArchive";

const MIME_TYPE = "application/vnd.giraffle.backup";

export interface PickedArchiveFile {
  name: string;
  bytes: Uint8Array;
}

export type ArchiveFileWriter = (bytes: Uint8Array) => Promise<void>;

export async function createArchiveFileWriter(name: string): Promise<ArchiveFileWriter> {
  return async (bytes) => {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) {
      file.delete();
      throw new Error("File sharing is unavailable on this device");
    }
    try {
      await Sharing.shareAsync(file.uri, {
        mimeType: MIME_TYPE,
        UTI: "com.giraffegraph.giraffle.backup",
        dialogTitle: "Save Giraffle backup",
      });
    } finally {
      if (file.exists) file.delete();
    }
  };
}

export async function pickArchiveFile(): Promise<PickedArchiveFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [MIME_TYPE, "application/octet-stream", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size !== undefined && asset.size > MAX_VAULT_ARCHIVE_BYTES) {
    throw new Error("Backup file is too large");
  }
  const file = new File(asset.uri);
  const bytes = await file.bytes();
  if (bytes.length > MAX_VAULT_ARCHIVE_BYTES) throw new Error("Backup file is too large");
  return { name: asset.name, bytes };
}
