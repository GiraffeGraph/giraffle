import * as DocumentPicker from "expo-document-picker";
import { MAX_VAULT_ARCHIVE_BYTES } from "./vaultArchive";
import type { ArchiveFileWriter, PickedArchiveFile } from "./archiveFile";

const MIME_TYPE = "application/vnd.giraffle.backup";

type WritableHandle = {
  createWritable(): Promise<{
    write(value: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<WritableHandle>;

export async function createArchiveFileWriter(
  name: string,
): Promise<ArchiveFileWriter | null> {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      // Request the destination before encryption: browsers require this picker to
      // be opened synchronously from the Export press.
      const handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description: "Giraffle backup", accept: { [MIME_TYPE]: [".giraffle"] } }],
      });
      return async (bytes) => {
        const writable = await handle.createWritable();
        await writable.write(new Blob([bytes.slice().buffer], { type: MIME_TYPE }));
        await writable.close();
      };
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return null;
      throw cause;
    }
  }

  return async (bytes) => {
    const url = URL.createObjectURL(
      new Blob([bytes.slice().buffer], { type: MIME_TYPE }),
    );
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  };
}

export async function pickArchiveFile(): Promise<PickedArchiveFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [MIME_TYPE, "application/octet-stream", "*/*"],
    copyToCacheDirectory: false,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.file) throw new Error("The selected backup could not be read");
  if (asset.file.size > MAX_VAULT_ARCHIVE_BYTES) throw new Error("Backup file is too large");
  const bytes = new Uint8Array(await asset.file.arrayBuffer());
  return { name: asset.name, bytes };
}
