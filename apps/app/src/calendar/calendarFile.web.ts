import * as DocumentPicker from "expo-document-picker";

const MIME_TYPE = "text/calendar";
const MAX_BYTES = 5 * 1024 * 1024;

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<{ write(value: Blob): Promise<void>; close(): Promise<void> }> }>;

export async function shareCalendarFile(contents: string): Promise<void> {
  const name = `giraffle-calendar-${Date.now()}.ics`;
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description: "Calendar", accept: { [MIME_TYPE]: [".ics"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([contents], { type: `${MIME_TYPE};charset=utf-8` }));
      await writable.close();
      return;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      throw cause;
    }
  }
  const url = URL.createObjectURL(new Blob([contents], { type: `${MIME_TYPE};charset=utf-8` }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function pickCalendarFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [MIME_TYPE, "text/plain", "*/*"],
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.file) throw new Error("The selected calendar could not be read");
  if (asset.file.size > MAX_BYTES) throw new Error("Calendar file is too large");
  return asset.file.text();
}
