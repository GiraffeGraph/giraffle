import type { CanvasElement } from "@giraffle/domain";
import { Asset } from "expo-asset";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { z } from "zod";
import { useTheme } from "@/design/ThemeProvider";

// Excalidraw ships as one self-contained HTML asset; it is loaded from disk so
// the several megabytes never cross the React Native bridge as a string.
const CANVAS_ASSET = require("../../../assets/excalidraw/canvas.html") as number;

function useCanvasUri(): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Asset.fromModule(CANVAS_ASSET)
      .downloadAsync()
      .then((asset) => {
        if (active) setUri(asset.localUri ?? asset.uri);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return uri;
}
interface AddRequest {
  pageId: string;
  title: string;
  elementId: string;
  versionNonce: number;
}

const canvasElementSchema = z
  .object({
    id: z.string().min(1).max(256),
    type: z.string().min(1).max(64),
    version: z.number().int().nonnegative(),
    versionNonce: z.number().int().nonnegative(),
    isDeleted: z.boolean(),
    customData: z
      .object({ girafflePageId: z.string().min(1).max(256).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), bridgeVersion: z.literal(1) }),
  z.object({
    type: z.literal("scene-change"),
    bridgeVersion: z.literal(1),
    elements: z.array(canvasElementSchema).max(100_000),
    appState: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("open-page"),
    bridgeVersion: z.literal(1),
    pageId: z.string().min(1),
  }),
  z.object({
    type: z.literal("bridge-error"),
    bridgeVersion: z.literal(1),
    message: z.string().min(1).max(300),
  }),
]);

export function CanvasView({
  elements,
  onChange,
  onOpenPage,
  onError,
  addRequest,
}: {
  elements: CanvasElement[];
  onChange: (
    elements: CanvasElement[],
    appState: Record<string, unknown>,
  ) => void;
  onOpenPage: (pageId: string) => void;
  onError?: (message: string) => void;
  addRequest: AddRequest | null;
}) {
  const { colors } = useTheme();
  const canvasUri = useCanvasUri();
  const ref = useRef<WebView>(null);
  const elementsRef = useRef(elements);
  const readyRef = useRef(false);
  const pendingAddRef = useRef<AddRequest | null>(null);

  // initialize() runs from the WebView load callback, long after commit.
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const injectAdd = useCallback((request: AddRequest) => {
    const payload = JSON.stringify(request).replace(/</g, "\\u003c");
    ref.current?.injectJavaScript(`window.GiraffleCanvas.addPage(${payload});true;`);
  }, []);

  const initialize = useCallback(() => {
    const payload = JSON.stringify({
      elements: elementsRef.current,
      theme: {
        bg: colors.background,
        dot: colors.border,
        surface: colors.surfaceStrong,
        ink: colors.text,
        muted: colors.muted,
        border: colors.borderStrong,
        accent: colors.accent,
        danger: colors.danger,
      },
    }).replace(/</g, "\\u003c");
    ref.current?.injectJavaScript(`window.GiraffleCanvas.init(${payload});true;`);
  }, [
    colors.accent,
    colors.background,
    colors.border,
    colors.borderStrong,
    colors.danger,
    colors.muted,
    colors.surfaceStrong,
    colors.text,
  ]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const value = messageSchema.parse(JSON.parse(event.nativeEvent.data));
        if (value.type === "ready") {
          readyRef.current = true;
          initialize();
          if (pendingAddRef.current) {
            injectAdd(pendingAddRef.current);
            pendingAddRef.current = null;
          }
        } else if (value.type === "scene-change") {
          onChange(value.elements as CanvasElement[], value.appState);
        } else if (value.type === "open-page") {
          onOpenPage(value.pageId);
        } else {
          onError?.(value.message);
        }
      } catch {
        onError?.("The local canvas sent an invalid update.");
      }
    },
    [initialize, injectAdd, onChange, onError, onOpenPage],
  );

  useEffect(() => {
    pendingAddRef.current = addRequest;
    if (addRequest && readyRef.current) {
      injectAdd(addRequest);
      pendingAddRef.current = null;
    }
  }, [addRequest, injectAdd]);

  if (!canvasUri) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <WebView
      ref={ref}
      source={{ uri: canvasUri }}
      originWhitelist={["file://*", "http://*", "https://*"]}
      // The canvas is the only document this view may ever load.
      onShouldStartLoadWithRequest={(request) =>
        request.url === canvasUri || request.url === "about:blank"
      }
      onMessage={onMessage}
      onContentProcessDidTerminate={() => {
        readyRef.current = false;
        ref.current?.reload();
      }}
      javaScriptEnabled
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      // iOS docks a prev/next/Done bar that would cover Excalidraw's own toolbar.
      hideKeyboardAccessoryView
      style={{ flex: 1, backgroundColor: colors.background }}
    />
  );
}
