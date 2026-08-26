import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const MIME_TYPE = "text/calendar";
const MAX_BYTES = 5 * 1024 * 1024;

export async function shareCalendarFile(contents: string): Promise<void> {
  const file = new File(Paths.cache, `giraffle-calendar-${Date.now()}.ics`);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  if (!(await Sharing.isAvailableAsync())) {
    file.delete();
    throw new Error("File sharing is unavailable on this device");
  }
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: MIME_TYPE,
      UTI: "public.calendar-event",
      dialogTitle: "Export Giraffle calendar",
    });
  } finally {
    if (file.exists) file.delete();
  }
}

export async function pickCalendarFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [MIME_TYPE, "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size !== undefined && asset.size > MAX_BYTES) throw new Error("Calendar file is too large");
  const file = new File(asset.uri);
  const bytes = await file.bytes();
  if (bytes.length > MAX_BYTES) throw new Error("Calendar file is too large");
  return new TextDecoder().decode(bytes);
}
