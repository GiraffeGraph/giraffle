import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, TextInput, type StyleProp, type TextStyle } from "react-native";
import { useTheme } from "@/design/ThemeProvider";

export function EditableText({
  value,
  onSave,
  style,
  placeholder = "Untitled",
  multiline = false,
}: {
  value: string;
  onSave: (value: string) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const valueRef = useRef(value);
  const lastSubmitted = useRef(value);
  const onSaveRef = useRef(onSave);
  const focused = useRef(false);
  onSaveRef.current = onSave;

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
