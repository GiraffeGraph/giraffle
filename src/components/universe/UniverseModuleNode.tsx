"use client";

import dynamic from "next/dynamic";
import type { NodeProps } from "@xyflow/react";
import type { UniverseModuleNode as UniverseModuleNodeType } from "./universe.types";

function stopCanvasPointerPropagation(
  event:
    | React.PointerEvent<HTMLDivElement>
    | React.MouseEvent<HTMLDivElement>
    | React.TouchEvent<HTMLDivElement>
    | React.WheelEvent<HTMLDivElement>
) {
  event.stopPropagation();
}

const InboxUniverseModule = dynamic(
  () =>
    import("./modules/ContentModules").then((mod) => mod.InboxUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);
const SearchUniverseModule = dynamic(
  () =>
    import("./modules/ContentModules").then((mod) => mod.SearchUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);
const LibraryUniverseModule = dynamic(
  () =>
    import("./modules/LibraryUniverseModule").then(
      (mod) => mod.LibraryUniverseModule
    ),
  {
    loading: () => <ModuleLoading />,
  }
);
const GraphUniverseModule = dynamic(
  () =>
    import("./modules/GraphUniverseModule").then((mod) => mod.GraphUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);
const PublishUniverseModule = dynamic(
  () =>
    import("./modules/ContentModules").then((mod) => mod.PublishUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);
const ProposalsUniverseModule = dynamic(
  () =>
    import("./modules/ContentModules").then((mod) => mod.ProposalsUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);
const NoteGptUniverseModule = dynamic(
  () =>
    import("./modules/ContentModules").then((mod) => mod.NoteGptUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);
const SettingsUniverseModule = dynamic(
  () =>
    import("./modules/ContentModules").then((mod) => mod.SettingsUniverseModule),
  {
    loading: () => <ModuleLoading />,
  }
);

export function UniverseModuleNode({
  data,
}: NodeProps<UniverseModuleNodeType>) {
  return (
    <div
      className={`universe-panel-node nowheel nodrag nopan ${
        data.moduleId === "notegpt" ? "universe-panel-node--notegpt" : ""
      }`}
      onPointerDownCapture={stopCanvasPointerPropagation}
      onMouseDownCapture={stopCanvasPointerPropagation}
      onTouchStartCapture={stopCanvasPointerPropagation}
      onWheelCapture={stopCanvasPointerPropagation}
    >
      <div className="universe-panel-header">
        <span className="material-symbols-outlined" aria-hidden="true">
          {data.icon}
        </span>
        {data.title}
      </div>
      <div className="universe-panel-body">
        {data.moduleId === "inbox" ? (
          <InboxUniverseModule seed={data.seed} />
        ) : null}
        {data.moduleId === "search" ? (
          <SearchUniverseModule seed={data.seed} />
        ) : null}
        {data.moduleId === "library" ? (
          <LibraryUniverseModule seed={data.seed} />
        ) : null}
        {data.moduleId === "graph" ? (
          <GraphUniverseModule seed={data.seed} />
        ) : null}
        {data.moduleId === "publish" ? (
          <PublishUniverseModule seed={data.seed} />
        ) : null}
        {data.moduleId === "proposals" ? (
          <ProposalsUniverseModule proposals={data.seed} />
        ) : null}
        {data.moduleId === "notegpt" ? (
          <NoteGptUniverseModule
            notes={data.seed.notes}
            folders={data.seed.folders}
          />
        ) : null}
        {data.moduleId === "settings" ? (
          <SettingsUniverseModule operationLogs={data.seed} />
        ) : null}
      </div>
    </div>
  );
}

function ModuleLoading() {
  return (
    <div className="universe-module-loading">
      <span className="universe-module-loading__dot" />
      <span>Yükleniyor</span>
    </div>
  );
}
