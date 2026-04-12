"use client";

import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/sidebar/CommandPalette";
import { encodeMaterialSymbol } from "@/components/sidebar/sidebar-icon-utils";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { getTemplateCategoryLabel } from "@/lib/template-category";
import {
  UNIVERSE_CAMERA_LIMITS,
  UNIVERSE_REGIONS,
  regionToViewport,
  type UniverseCameraState,
} from "@/lib/universe-regions";
import { saveUniverseCameraAction } from "@/server/api/universe";
import { RegionFrameNode } from "./RegionFrameNode";
import { UniverseModuleNode } from "./UniverseModuleNode";
import type {
  UniverseModuleId,
  UniverseModuleNodeData,
  UniversePaletteData,
  UniverseShellProps,
} from "./universe.types";

const NODE_TYPES: NodeTypes = {
  module: UniverseModuleNode,
  regionFrame: RegionFrameNode,
};

const REGION_FRAME_WIDTH = 1560;
const REGION_FRAME_HEIGHT = 1080;

const CAMERA_EPSILON = {
  pan: 0.5,
  zoom: 0.002,
} as const;

type UniverseCursorMode = "interact" | "move";

interface UniverseModuleLayout {
  moduleId: UniverseModuleId;
  regionId: string;
  title: string;
  description: string;
  icon: string;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  zoom: number;
}

const UNIVERSE_MODULE_LAYOUTS: UniverseModuleLayout[] = [
  {
    moduleId: "inbox",
    regionId: "daily",
    title: "Gelen kutusu",
    description: "Klasörsüz notlar için hızlı triage alanı.",
    icon: "inbox",
    position: { x: -360, y: -240 },
    size: { width: 720, height: 660 },
    zoom: 0.96,
  },
  {
    moduleId: "search",
    regionId: "notes",
    title: "Arama",
    description: "Not, klasör, şablon ve çözülmemiş bağlantı araması.",
    icon: "search",
    position: { x: 2620, y: -340 },
    size: { width: 1100, height: 780 },
    zoom: 0.76,
  },
  {
    moduleId: "library",
    regionId: "library",
    title: "Kütüphane",
    description: "Koleksiyonu universe içinde açar.",
    icon: "library_books",
    position: { x: 5800, y: -320 },
    size: { width: 1280, height: 900 },
    zoom: 0.64,
  },
  {
    moduleId: "publish",
    regionId: "library",
    title: "Yayınlar",
    description: "Yayınlanan notların hafif görünümü.",
    icon: "publish",
    position: { x: 6510, y: 340 },
    size: { width: 520, height: 420 },
    zoom: 0.98,
  },
  {
    moduleId: "graph",
    regionId: "graph",
    title: "Bağlantı ağı",
    description: "İlişki grafiğini doğrudan universe içinde açar.",
    icon: "hub",
    position: { x: -440, y: 2320 },
    size: { width: 1060, height: 960 },
    zoom: 0.72,
  },
  {
    moduleId: "proposals",
    regionId: "graph",
    title: "Öneriler",
    description: "AI öneri kuyruğu.",
    icon: "auto_awesome",
    position: { x: 300, y: 2940 },
    size: { width: 520, height: 420 },
    zoom: 0.98,
  },
  {
    moduleId: "spotter",
    regionId: "ai",
    title: "Spotter",
    description: "Insight spotter çalışma alanı.",
    icon: "smart_toy",
    position: { x: 2640, y: 2260 },
    size: { width: 1140, height: 1000 },
    zoom: 0.76,
  },
  {
    moduleId: "settings",
    regionId: "settings",
    title: "Ayarlar",
    description: "Tema ve eşitleme görünümü.",
    icon: "settings",
    position: { x: -3800, y: -250 },
    size: { width: 840, height: 780 },
    zoom: 0.9,
  },
];

const MODULE_LAYOUT_BY_ID = new Map(
  UNIVERSE_MODULE_LAYOUTS.map((layout) => [layout.moduleId, layout] as const)
);

function buildRegionFrameNodes() {
  return UNIVERSE_REGIONS.map<Node>((region) => ({
    id: `region-${region.id}`,
    type: "regionFrame",
    position: {
      x: region.x - REGION_FRAME_WIDTH / 2,
      y: region.y - REGION_FRAME_HEIGHT / 2,
    },
    data: {
      label: region.label,
      caption: region.caption,
    },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -10,
    style: {
      width: REGION_FRAME_WIDTH,
      height: REGION_FRAME_HEIGHT,
    },
  }));
}

function buildModuleNodeData(
  moduleId: UniverseModuleId,
  props: Omit<UniverseShellProps, "initialCamera" | "palette">
): UniverseModuleNodeData {
  const layout = MODULE_LAYOUT_BY_ID.get(moduleId);

  if (!layout) {
    throw new Error(`Unknown universe module: ${moduleId}`);
  }

  switch (moduleId) {
    case "inbox":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.inboxSeed,
      };
    case "search":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.searchSeed,
      };
    case "library":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.librarySeed,
      };
    case "graph":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.graphSeed,
      };
    case "publish":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.publishSeed,
      };
    case "proposals":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.proposals,
      };
    case "spotter":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.spotterSeed,
      };
    case "settings":
      return {
        moduleId,
        title: layout.title,
        icon: layout.icon,
        seed: props.settingsLogs,
      };
  }
}

function buildModuleNodes(
  props: Omit<UniverseShellProps, "initialCamera" | "palette">
) {
  return UNIVERSE_MODULE_LAYOUTS.map<Node<UniverseModuleNodeData, "module">>(
    (layout) => ({
      id: `module-${layout.moduleId}`,
      type: "module",
      position: layout.position,
      data: buildModuleNodeData(layout.moduleId, props),
      draggable: false,
      selectable: false,
      focusable: false,
      style: {
        width: layout.size.width,
        height: layout.size.height,
        pointerEvents: "all",
      },
    })
  );
}

function buildUniverseNodes(
  props: Omit<UniverseShellProps, "initialCamera">
) {
  return [...buildRegionFrameNodes(), ...buildModuleNodes(props)];
}

function matchesQuery(query: string, parts: Array<string | null | undefined>) {
  if (!query) {
    return true;
  }

  return parts
    .filter((part): part is string => Boolean(part))
    .some((part) => part.toLowerCase().includes(query));
}

function getViewportForCenter(centerX: number, centerY: number, zoom: number) {
  return {
    x: -centerX * zoom + window.innerWidth / 2,
    y: -centerY * zoom + window.innerHeight / 2,
    zoom,
  };
}

function buildPaletteItems(args: {
  palette: UniversePaletteData;
  router: {
    push: (href: string) => void;
  };
  normalizedQuery: string;
  flyToRegion: (regionId: string) => void;
  flyToModule: (moduleId: UniverseModuleId) => void;
}): CommandPaletteItem[] {
  const { palette, router, normalizedQuery, flyToRegion, flyToModule } = args;

  const baseItems: CommandPaletteItem[] = [
    {
      id: "nav-dashboard",
      group: "Geçişler",
      title: "Klasik mod",
      description: "Sidebar tabanlı çalışma kabuğuna dön.",
      icon: encodeMaterialSymbol("dashboard"),
      onSelect: async () => {
        router.push("/dashboard");
      },
    },
  ];

  const regionItems = UNIVERSE_REGIONS.filter((region) =>
    matchesQuery(normalizedQuery, [region.label, region.caption])
  ).map<CommandPaletteItem>((region) => ({
    id: `region-${region.id}`,
    group: "Bölgeler",
    title: `${region.label} bölgesi`,
    description: region.caption,
    icon: encodeMaterialSymbol("location_on"),
    onSelect: async () => {
      flyToRegion(region.id);
    },
  }));

  const moduleItems = UNIVERSE_MODULE_LAYOUTS.filter((layout) =>
    matchesQuery(normalizedQuery, [layout.title, layout.description])
  ).map<CommandPaletteItem>((layout) => ({
    id: `module-${layout.moduleId}`,
    group: "Universe",
    title: layout.title,
    description: layout.description,
    icon: encodeMaterialSymbol(layout.icon),
    onSelect: async () => {
      flyToModule(layout.moduleId);
    },
  }));

  const folderItems = palette.folders
    .filter((folder) => matchesQuery(normalizedQuery, [folder.name]))
    .slice(0, normalizedQuery ? 8 : 5)
    .map<CommandPaletteItem>((folder) => ({
      id: `folder-${folder.id}`,
      group: "Klasörler",
      title: folder.name,
      description: "Klasör görünümünü aç",
      icon: folder.icon ?? encodeMaterialSymbol("folder"),
      onSelect: async () => {
        router.push(`/folders/${folder.id}`);
      },
    }));

  const noteItems = palette.notes
    .filter((note) => matchesQuery(normalizedQuery, [note.title]))
    .slice(0, normalizedQuery ? 8 : 5)
    .map<CommandPaletteItem>((note) => ({
      id: `note-${note.id}`,
      group: "Notlar",
      title: note.title,
      description: "Notu aç",
      icon: note.icon ?? encodeMaterialSymbol("description"),
      onSelect: async () => {
        router.push(`/notes/${note.id}`);
      },
    }));

  const tagItems = palette.tags
    .filter((tag) => matchesQuery(normalizedQuery, [tag.name]))
    .slice(0, normalizedQuery ? 8 : 5)
    .map<CommandPaletteItem>((tag) => ({
      id: `tag-${tag.id}`,
      group: "Etiketler",
      title: `#${tag.name}`,
      description: `${tag.noteCount} not içeren etiket`,
      icon: "#",
      onSelect: async () => {
        router.push(`/tags/${tag.name}`);
      },
    }));

  const templateItems = palette.templates
    .filter((template) =>
      matchesQuery(normalizedQuery, [
        template.name,
        template.description,
        template.previewText,
      ])
    )
    .slice(0, normalizedQuery ? 6 : 4)
    .map<CommandPaletteItem>((template) => ({
      id: `template-${template.id}`,
      group: "Şablonlar",
      title: template.name,
      description:
        template.description ??
        template.previewText ??
        `${getTemplateCategoryLabel(template.category)} şablonu`,
      icon: template.icon ?? encodeMaterialSymbol("tooltip"),
      onSelect: async () => {
        router.push(`/templates?selected=${template.id}`);
      },
    }));

  return [
    ...baseItems.filter((item) =>
      matchesQuery(normalizedQuery, [item.title, item.description])
    ),
    ...moduleItems,
    ...regionItems,
    ...noteItems,
    ...folderItems,
    ...tagItems,
    ...templateItems,
  ];
}

function isSameCamera(left: UniverseCameraState, right: Viewport) {
  return (
    Math.abs(left.cameraX - right.x) < CAMERA_EPSILON.pan &&
    Math.abs(left.cameraY - right.y) < CAMERA_EPSILON.pan &&
    Math.abs(left.zoom - right.zoom) < CAMERA_EPSILON.zoom
  );
}

function UniverseCanvas({
  initialCamera,
  palette,
  inboxSeed,
  searchSeed,
  librarySeed,
  graphSeed,
  publishSeed,
  proposals,
  spotterSeed,
  settingsLogs,
}: UniverseShellProps) {
  const router = useRouter();
  const { setViewport } = useReactFlow();
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef(initialCamera);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [cursorMode, setCursorMode] = useState<UniverseCursorMode>("interact");
  const deferredQuery = useDeferredValue(paletteQuery);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const nodes = useMemo(
    () =>
      buildUniverseNodes({
        palette,
        inboxSeed,
        searchSeed,
        librarySeed,
        graphSeed,
        publishSeed,
        proposals,
        spotterSeed,
        settingsLogs,
      }),
    [
      graphSeed,
      inboxSeed,
      librarySeed,
      spotterSeed,
      palette,
      proposals,
      publishSeed,
      searchSeed,
      settingsLogs,
    ]
  );

  const flyToRegion = useCallback(
    (regionId: string) => {
      const region = UNIVERSE_REGIONS.find((entry) => entry.id === regionId);

      if (!region) {
        return;
      }

      const viewport = regionToViewport(
        region,
        window.innerWidth,
        window.innerHeight
      );

      setViewport(viewport, { duration: 650 });
      setIsPaletteOpen(false);
    },
    [setViewport]
  );

  const flyToModule = useCallback(
    (moduleId: UniverseModuleId) => {
      const layout = MODULE_LAYOUT_BY_ID.get(moduleId);

      if (!layout) {
        return;
      }

      const centerX = layout.position.x + layout.size.width / 2;
      const centerY = layout.position.y + layout.size.height / 2;

      setViewport(
        getViewportForCenter(centerX, centerY, layout.zoom),
        { duration: 650 }
      );
      setIsPaletteOpen(false);
    },
    [setViewport]
  );

  const paletteItems = useMemo(
    () =>
      buildPaletteItems({
        palette,
        router,
        normalizedQuery,
        flyToRegion,
        flyToModule,
      }),
    [flyToModule, flyToRegion, normalizedQuery, palette, router]
  );

  useEffect(() => {
    setViewport(
      {
        x: initialCamera.cameraX,
        y: initialCamera.cameraY,
        zoom: initialCamera.zoom,
      },
      { duration: 0 }
    );
  }, [initialCamera.cameraX, initialCamera.cameraY, initialCamera.zoom, setViewport]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsPaletteOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMoveEnd = (_event: unknown, viewport: Viewport) => {
    if (isSameCamera(lastSavedRef.current, viewport)) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      lastSavedRef.current = {
        cameraX: viewport.x,
        cameraY: viewport.y,
        zoom: viewport.zoom,
      };
      void saveUniverseCameraAction(viewport.x, viewport.y, viewport.zoom);
    }, 1200);
  };

  const closePalette = () => {
    setIsPaletteOpen(false);
    setPaletteQuery("");
  };

  return (
    <div className="universe-shell" data-cursor-mode={cursorMode}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        onMoveEnd={handleMoveEnd}
        fitView={false}
        minZoom={UNIVERSE_CAMERA_LIMITS.minZoom}
        maxZoom={UNIVERSE_CAMERA_LIMITS.maxZoom}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={cursorMode === "move"}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        selectionOnDrag={false}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="var(--border-strong)"
        />
        <MiniMap
          nodeColor="var(--surface-3)"
          maskColor="rgba(15, 15, 15, 0.24)"
          className="universe-minimap"
          style={{
            background: "var(--surface-glass-strong)",
            border: "1px solid var(--border-soft)",
            borderRadius: "16px",
          }}
        />

        <Panel position="top-right" className="universe-toolbar">
          <button
            type="button"
            className="universe-toolbar__button"
            onClick={() => router.push("/dashboard")}
            aria-label="Klasik moda dön"
            title="Klasik moda dön"
          >
            <span className="material-symbols-outlined">dashboard</span>
          </button>
          <button
            type="button"
            className="universe-toolbar__button"
            onClick={() => setIsPaletteOpen(true)}
            aria-label="Komut paletini aç"
            title="Komut paletini aç"
          >
            <span className="material-symbols-outlined">search</span>
          </button>
          <ThemeSelector vertical />
          <div className="universe-toolbar__mode-stack" aria-label="Cursor mode">
            <button
              type="button"
              className={`universe-toolbar__mode-button ${
                cursorMode === "interact"
                  ? "universe-toolbar__mode-button--active"
                  : ""
              }`}
              onClick={() => setCursorMode("interact")}
              aria-label="İçerik modu"
              aria-pressed={cursorMode === "interact"}
              title="İçerik modu"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                ads_click
              </span>
            </button>
            <button
              type="button"
              className={`universe-toolbar__mode-button ${
                cursorMode === "move"
                  ? "universe-toolbar__mode-button--active"
                  : ""
              }`}
              onClick={() => setCursorMode("move")}
              aria-label="Taşıma modu"
              aria-pressed={cursorMode === "move"}
              title="Taşıma modu"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                pan_tool_alt
              </span>
            </button>
          </div>
        </Panel>

        <Panel position="top-left" className="universe-dev-badge">
          <span className="material-symbols-outlined" aria-hidden="true">
            construction
          </span>
          <span>This section is under development</span>
        </Panel>

        <Panel position="bottom-center" className="universe-region-nav">
          {UNIVERSE_REGIONS.map((region) => (
            <button
              key={region.id}
              type="button"
              className="universe-region-pill"
              onClick={() => flyToRegion(region.id)}
            >
              {region.label}
            </button>
          ))}
        </Panel>
      </ReactFlow>

      <CommandPalette
        open={isPaletteOpen}
        query={paletteQuery}
        items={paletteItems}
        onQueryChange={setPaletteQuery}
        onClose={closePalette}
      />
    </div>
  );
}

export function UniverseShell(props: UniverseShellProps) {
  return (
    <ReactFlowProvider>
      <UniverseCanvas {...props} />
    </ReactFlowProvider>
  );
}
