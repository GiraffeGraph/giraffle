export interface UniverseCameraState {
  cameraX: number;
  cameraY: number;
  zoom: number;
}

export interface UniverseRegion {
  id: string;
  label: string;
  caption: string;
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_UNIVERSE_CAMERA: UniverseCameraState = {
  cameraX: 0,
  cameraY: 0,
  zoom: 0.75,
};

export const UNIVERSE_CAMERA_LIMITS = {
  minZoom: 0.1,
  maxZoom: 2,
} as const;

export const UNIVERSE_REGIONS: UniverseRegion[] = [
  {
    id: "daily",
    label: "Günlük",
    caption: "Pano ve sıcak akışlara hızlı geçiş",
    x: 0,
    y: 0,
    zoom: 0.9,
  },
  {
    id: "notes",
    label: "Notlar",
    caption: "Arama, şablonlar ve son notlar",
    x: 3200,
    y: 0,
    zoom: 0.82,
  },
  {
    id: "library",
    label: "Kütüphane",
    caption: "Koleksiyon, yayın ve arşiv bakışı",
    x: 6400,
    y: 0,
    zoom: 0.82,
  },
  {
    id: "graph",
    label: "Graf",
    caption: "İlişki ağları ve öneriler",
    x: 0,
    y: 2800,
    zoom: 0.72,
  },
  {
    id: "ai",
    label: "AI",
    caption: "Copilot, sentez ve planlama katmanı",
    x: 3200,
    y: 2800,
    zoom: 0.9,
  },
  {
    id: "settings",
    label: "Ayarlar",
    caption: "Tercihler, hesap ve senkron görünümü",
    x: -3200,
    y: 0,
    zoom: 1.02,
  },
];

export function normalizeUniverseCamera(
  camera: Partial<UniverseCameraState> | null | undefined
): UniverseCameraState {
  const cameraX = camera?.cameraX;
  const cameraY = camera?.cameraY;
  const zoom = camera?.zoom ?? DEFAULT_UNIVERSE_CAMERA.zoom;
  const nextZoom = Number.isFinite(zoom)
    ? Math.min(
        UNIVERSE_CAMERA_LIMITS.maxZoom,
        Math.max(UNIVERSE_CAMERA_LIMITS.minZoom, zoom)
      )
    : DEFAULT_UNIVERSE_CAMERA.zoom;

  return {
    cameraX: typeof cameraX === "number" && Number.isFinite(cameraX)
      ? cameraX
      : DEFAULT_UNIVERSE_CAMERA.cameraX,
    cameraY: typeof cameraY === "number" && Number.isFinite(cameraY)
      ? cameraY
      : DEFAULT_UNIVERSE_CAMERA.cameraY,
    zoom: nextZoom,
  };
}

export function regionToViewport(
  region: UniverseRegion,
  screenWidth: number,
  screenHeight: number
) {
  return {
    x: -region.x * region.zoom + screenWidth / 2,
    y: -region.y * region.zoom + screenHeight / 2,
    zoom: region.zoom,
  };
}
