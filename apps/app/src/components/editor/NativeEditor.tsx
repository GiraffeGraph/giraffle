import { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useTheme } from "@/design/ThemeProvider";
import { parseEditorMessage } from "@/domain/editor/bridge";
import type { TiptapDocument } from "@/domain/models";
import { EDITOR_HTML } from "./editorArtifact";

// Synthetic origin: the editor never touches the network, the host only gives
// the inlined document a stable origin to satisfy WebKit and to scope the
// navigation guard below. WebKit reports it with and without a trailing slash,
// so the guard matches the host rather than a full path prefix.
const EDITOR_HOST = "https://giraffle.local";
const EDITOR_ORIGIN = `${EDITOR_HOST}/editor/`;
const EDITOR_SOURCE = { html: EDITOR_HTML, baseUrl: EDITOR_ORIGIN } as const;

function isEditorUrl(url: string): boolean {
  return url === "about:blank" || url === EDITOR_HOST || url.startsWith(`${EDITOR_HOST}/`);
}

export function NativeEditor({
  document,
  onChange,
  onOpenLink,
  onError,
}: {
  document: TiptapDocument;
  onChange: (document: TiptapDocument) => void;
  onOpenLink: (target: string) => void;
  onError?: (message: string) => void;
}) {
  const { colors } = useTheme();
  const ref = useRef<WebView>(null);
  const documentRef = useRef(document);

  // initialize() runs from the WebView load callback, long after commit.
  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  const initialize = useCallback(() => {
    const payload = JSON.stringify({
      document: documentRef.current,
      theme: { text: colors.text, muted: colors.faint, link: colors.link },
    }).replace(/</g, "\\u003c");
    ref.current?.injectJavaScript(
      `window.GiraffleEditor.init(${payload});true;`,
    );
  }, [colors.faint, colors.link, colors.text]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = parseEditorMessage(event.nativeEvent.data);
        if (message.type === "ready") initialize();
        else if (message.type === "document-change") {
          onChange(message.document as TiptapDocument);
        } else if (message.type === "open-link") {
          onOpenLink(message.target);
        } else if (message.type === "bridge-error") {
          onError?.(message.message);
        }
      } catch {
        onError?.("The local editor sent an invalid update.");
      }
    },
    [initialize, onChange, onError, onOpenLink],
  );

  return (
    <WebView
      ref={ref}
      source={EDITOR_SOURCE}
      originWhitelist={[`${EDITOR_HOST}*`]}
      onShouldStartLoadWithRequest={(request) => isEditorUrl(request.url)}
      javaScriptEnabled
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      keyboardDisplayRequiresUserAction={false}
      // iOS docks its own prev/next/Done bar at the bottom, which lands on top of
      // the tab bar whenever a hardware keyboard is attached.
      hideKeyboardAccessoryView
      onMessage={onMessage}
      onContentProcessDidTerminate={() => ref.current?.reload()}
      style={[styles.webview, { backgroundColor: colors.background }]}
      containerStyle={{ backgroundColor: colors.background }}
      scrollEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, minHeight: 500 },
});
