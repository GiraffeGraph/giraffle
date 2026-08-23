import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, TextInput, type StyleProp, type TextStyle } from "react-native";
import { useTheme } from "@/design/ThemeProvider";

export function EditableText({
  value,
  onSave,
  style,
  placeholder = "Untitled",
  multiline = false,
  autoFocus = false,
  accessibilityLabel,
}: {
  value: string;
  onSave: (value: string) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  multiline?: boolean;
  /** A page that has just been created opens with its title ready to type. */
  autoFocus?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const valueRef = useRef(value);
  const lastSubmitted = useRef(value);
  const onSaveRef = useRef(onSave);
  const focused = useRef(false);

  // commit() only ever runs from handlers and cleanups, so syncing after the
  // commit phase still hands it the current callback.
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    valueRef.current = value;
    lastSubmitted.current = value;
    if (!focused.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const commit = useCallback((updateUi = true) => {
    const next = draftRef.current.trim() || placeholder;
    if (next !== draftRef.current) {
      draftRef.current = next;
      if (updateUi) setDraft(next);
    }
    if (next !== valueRef.current && next !== lastSubmitted.current) {
      lastSubmitted.current = next;
      onSaveRef.current(next);
    }
  }, [placeholder]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && focused.current) commit();
    });
    return () => {
      subscription.remove();
      if (focused.current) commit(false);
    };
  }, [commit]);

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel ?? placeholder}
      autoFocus={autoFocus}
      selectTextOnFocus={autoFocus}
      value={draft}
      multiline={multiline}
      blurOnSubmit={!multiline}
      onFocus={() => {
        focused.current = true;
      }}
      onChangeText={(next) => {
        draftRef.current = next;
        setDraft(next);
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onSubmitEditing={() => {
        if (!multiline) commit();
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      style={[{ color: colors.text, padding: 0 }, style]}
    />
  );
}
