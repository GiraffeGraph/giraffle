// Bundles Excalidraw into one self-contained HTML file the WebView can load
// from disk: no network, no ES modules, no relative asset requests.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staging = join(here, ".staging");
const outFile = join(here, "../../apps/mobile/assets/excalidraw/canvas.html");

/**
 * Excalidraw pulls in every translation through a dynamic import glob. Only
 * English is used here, so the rest resolve to empty modules.
 */
const dropUnusedLocales = {
  name: "giraffle-drop-unused-locales",
  load(id) {
    const match = /[\\/]locales[\\/]([^/\\]+)$/.exec(id);
    if (!match) return null;
    const file = match[1];
    if (file.startsWith("en") || file === "percentages.json") return null;
    return "export default {};";
  },
};

await build({
  root: here,
  configFile: false,
  plugins: [react(), dropUnusedLocales],
  // React and Excalidraw read process.env at runtime; nothing defines it inside
  // a WebView, so the values are folded in at build time.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  build: {
    outDir: staging,
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: true,
    target: "safari16",
    lib: {
      entry: join(here, "entry.tsx"),
      formats: ["iife"],
      name: "GiraffleCanvasBundle",
      fileName: () => "canvas.js",
    },
  },
});

const [js, css] = await Promise.all([
  readFile(join(staging, "canvas.js"), "utf8"),
  readFile(join(staging, "giraffle.css"), "utf8"),
]);

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>${css}</style>
<style>
  html, body, #canvas { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  #canvas { position: relative; }
</style>
</head>
<body>
<div id="canvas"></div>
<pre id="boot-error" style="display:none;position:absolute;inset:0;margin:0;padding:16px;font:12px/1.5 -apple-system,monospace;color:#b3261e;white-space:pre-wrap;overflow:auto"></pre>
<script>
  window.process = window.process || { env: { NODE_ENV: "production" } };
  // A crash inside the bundle would otherwise leave a blank canvas with no clue.
  window.addEventListener("error", function (event) {
    var node = document.getElementById("boot-error");
    if (!node) return;
    node.style.display = "block";
    node.textContent += (event.message || "error") + "\\n" + ((event.error && event.error.stack) || "") + "\\n\\n";
  });
</script>
<script>${js.replace(/<\/script>/gi, "<\\/script>")}</script>
</body>
</html>`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, "utf8");
await rm(staging, { recursive: true, force: true });

console.log(`canvas.html ${(html.length / 1_048_576).toFixed(1)} MB`);
