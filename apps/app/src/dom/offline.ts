import type { DOMProps } from "expo/dom";
import { domLockdownScript } from "./lockdown";

const LOCKDOWN = domLockdownScript({ blockNetwork: !__DEV__ });

/**
 * The webview settings both DOM components share: the offline lockdown runs
 * before any bundle code, and the view paints the app background so a slow
 * first frame does not flash white.
 */
export function offlineDomProps(options: {
  backgroundColor: string;
  scrollEnabled: boolean;
}): DOMProps {
  return {
    injectedJavaScriptBeforeContentLoaded: LOCKDOWN,
    // iOS docks its own prev/next/Done bar at the bottom, which lands on top of
    // the tab bar whenever a hardware keyboard is attached.
    hideKeyboardAccessoryView: true,
    scrollEnabled: options.scrollEnabled,
    style: { flex: 1, backgroundColor: options.backgroundColor },
    containerStyle: { backgroundColor: options.backgroundColor },
  };
}
