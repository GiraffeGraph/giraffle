import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";
import { dark, light, type ThemeColors } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";
interface ThemeContextValue {
  colors: ThemeColors;
  preference: ThemePreference;
  dark: boolean;
  setPreference(value: ThemePreference): void;
}

const Context = createContext<ThemeContextValue | null>(null);
const KEY = "giraffle.theme";

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setValue] = useState<ThemePreference>("system");

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setValue(value);
        }
      })
      .catch(() => undefined);
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    setValue(value);
    void AsyncStorage.setItem(KEY, value).catch(() => undefined);
  }, []);
  const isDark = preference === "dark" || (preference === "system" && system === "dark");
  const value = useMemo(
    () => ({ colors: isDark ? dark : light, preference, dark: isDark, setPreference }),
    [isDark, preference, setPreference],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error("useTheme requires ThemeProvider");
  return value;
}
