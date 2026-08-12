# giraffle

Headless terminal and local-agent access to the same encrypted vault used by the Giraffle macOS app.

## Install

```bash
npm install --global giraffle
giraffle desktop install
giraffle desktop status
```

The npm package installs the `giraffle` command. `giraffle desktop install` opens the matching official GitHub release, where the signed and notarized macOS app can be installed. The CLI does not create a second vault and does not silently modify `/Applications` during npm installation.

## Discover commands

```bash
giraffle --help
giraffle commands
giraffle commands --json
giraffle pages create --help
```

## Examples

```bash
giraffle pages create "Release plan" --markdown "Ship on Friday" --json
giraffle pages capture "Draft announcement" --json
giraffle pages update PAGE_ID --priority do --json
giraffle pages search release --json

# Build a safe, mergeable Excalidraw graph without writing raw scene JSON
giraffle canvas apply CANVAS_ID --spec @diagram.json --json
giraffle canvas add-page CANVAS_ID PAGE_ID --key research
giraffle canvas add-note CANVAS_ID "Main idea" --key idea
giraffle canvas connect CANVAS_ID research idea --label "leads to"
giraffle canvas layout CANVAS_ID mindmap
```

A canvas spec contains stable node keys, text, optional Page IDs, edges, and a layout (`grid`, `horizontal`, `vertical`, `mindmap`, `radial`, `timeline`, or `columns`). Giraffle compiles it into valid Excalidraw elements, maintains bindings and versions, and preserves hand-drawn elements. Reapplying the same spec is idempotent.

For automation, use stable JSON output with `--json`, structured input with `--input`, and long content with `--stdin`. See the [main documentation](https://github.com/GiraffeGraph/giraffle#headless-cli) for credentials, exit codes, and architecture.
