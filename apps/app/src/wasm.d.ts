// Metro serves files listed in `assetExts` as URLs; `.wasm` is registered there
// so the SQLite engine can be fetched like any other asset.
declare module "*.wasm" {
  const uri: string;
  export default uri;
}

declare module "@excalidraw/excalidraw/index.css";
