# Arq

A desktop and web diagramming tool for event-driven architecture, born out of Solace PubSub+
topology diagrams but built as a general-purpose shape editor usable for any messaging or
infrastructure diagram.

Three things make it different from a general-purpose drawing tool:

1. **Declarative JSON, not a blob of coordinates.** A diagram is a plain, schema-validated
   document — nodes, edges, groups — so a script or an LLM can generate one without ever
   emitting pixel positions.
2. **Screen matches export.** Node metrics and edge geometry live in one package that both
   the canvas and the SVG exporter import, so what you export is what you saw, byte for byte.
3. **Free-form shapes with real styling, not a fixed icon set.** Rectangles, ellipses,
   diamonds, triangles, text, lines and arrows, each with its own fill, stroke, dash, glow and
   arrowheads — an edge can even end on a bare point instead of a node, so a connector and a
   free-floating line are the same thing.

> **Status: phase 2 complete.** The editor creates, styles, connects, saves and exports
> diagrams today, with an Inspector for per-object properties and a Settings panel for
> defaults. Icon-pack import, group editing on the canvas, automatic layout and flow animation
> are **not built yet** — see [Roadmap](#roadmap).

---

## Contents

- [Install](#install)
- [Using Arq](#using-arq)
- [The .arq file format](#the-arq-file-format)
- [Development](#development)
- [Building the desktop app](#building-the-desktop-app)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Security](#security)
- [Legal and trademarks](#legal-and-trademarks)
- [License](#license)

---

## Install

### Windows desktop

Download `Arq_<version>_x64-setup.exe` from the releases page and run it.

**Builds are currently unsigned**, so SmartScreen will warn you. Choose *More info* → *Run
anyway* if you trust the source. Code signing is planned before any wide distribution.

### Web

There is no hosted build yet. Run it locally — see [Development](#development).

---

## Using Arq

The desktop and web builds are the same editor; only the file dialogs differ.

### Creating shapes

The **palette** on the left has two tabs: **Shapes** (built in) and **Icons** (for imported
icon packs, not built yet). Shapes offers exactly seven items:

**Rectangle** · **Ellipse** · **Diamond** · **Triangle** · **Text** · **Line** · **Arrow**

Either **drag** an item onto the canvas or **double-click** it to drop one in. Palette items
are keyboard reachable — Tab to one and press **Enter** or **Space**. Rectangle through Text
create nodes; Line and Arrow create a free-floating edge with no attached node — differing
only in whether the end carries an arrowhead.

### Connecting

Drag from a node's **source handle** to another node's **target handle** to connect two nodes.
An edge's endpoints aren't limited to nodes, though: dragging a Line or Arrow palette item onto
open canvas creates an edge whose ends are bare `{x, y}` points, which you can later drag onto
a node to attach it. Edges carry no semantic type — they're styled, not typed: routing
(straight, curved or orthogonal), an arrowhead per end (none, arrow, triangle, diamond or
circle), stroke colour, width, dash and an optional glow, all editable in the Inspector.

**Stacking.** Where elements overlap, the **Layer** buttons in the Inspector (or `Ctrl+]` /
`Ctrl+[`) bring the selection forward or send it back. Shapes and lines share one stack, so a line
can be brought over a shape it crosses; the order is saved as a `z` number on each. A shape's
**Stroke** row also has **No border**.

**Shaping a line.** Select a line to get dots on it:

- The dots at its **ends** re-point it — drop one on a shape to attach, on open canvas to float.
- A **right-angled** line has a dot on every leg. Drag one across to move that leg; drag the first
  or last leg and a new turn appears right where you grabbed it — so a line can be routed around
  whatever is in its way.
- A **straight or curved** line has faint dots between its bends: drag one to add a bend there.
  Drag a bend to move it, double-click it to remove it.
- **Reset route** in the Inspector hands the line back to the automatic router.

### The Inspector

The panel on the right edits whatever is selected: the document (title, canvas background)
when nothing is selected, or the style of the selected node(s) or edge(s) otherwise. Selecting
several objects at once edits them together — a field that disagrees across the selection
shows as blank/indeterminate rather than picking one value arbitrarily, and setting it applies
to all of them.

Shapes and lines have three tabs: **Style**, **Text** and **Animation**. The **Text** tab sets how
a label reads — the label itself, typeface (hand-drawn, sans serif, serif, monospace), size,
colour, **bold**, *italic*, underline, strikethrough, and an optional background plate (off by
default; a line's label is bare text on the line unless you give it one). Double-clicking a label
to type into it selects that shape or line and opens the Text tab, so the settings are right there.
Only the hand-drawn face is embedded in exports; the others use fonts every system already has.

### Settings

The toolbar's **Settings** button opens a modal for theme (light/dark/system), grid
(off/dots/lines), snap-to-grid, and the fill/stroke/arrowhead defaults used for newly created
shapes and edges. Settings apply only at creation time — they're baked into the new element's
own `style`, never rewritten into an existing document, so a `.arq` file always renders the
same regardless of who opens it or what their local settings are.

The canvas pattern (in the Inspector when nothing is selected) is plain, dots, crosses or **grid** —
graph paper, with a thin line every grid step, a medium one every fifth and a heavy one every
tenth. A **Grid** export background draws the same paper.

### Moving and deleting

Drag a node to position it. Selected nodes move with the **arrow keys** (1px, or 10px with
**Shift**), and a run of arrow presses collapses into a single undo entry, so one undo reverts
the whole gesture. **Delete** or **Backspace** removes the selection, also as one undo entry.

### Navigating the canvas

| Input | Action |
|---|---|
| Two-finger scroll / mouse wheel | Pan |
| Pinch | Zoom |
| `Ctrl` + wheel | Zoom |
| `Ctrl +` / `Ctrl -` | Zoom step in / out |
| `Ctrl 0` | Reset zoom to 100% |
| `Ctrl 1` | Fit view to content |

### Toolbar and shortcuts

| Action | Shortcut |
|---|---|
| New diagram | `Ctrl+N` |
| Open | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` |
| Select all | `Ctrl+A` |
| Copy / Cut / Paste selection | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| Duplicate selection | `Ctrl+D` |
| Nudge selection | Arrow keys (`Shift` for 10px) |
| Bring forward / send backward | `Ctrl+]` / `Ctrl+[` (add `Shift` for all the way) |
| Delete selection | `Delete` / `Backspace` |
| Pan | Hold `Space` and drag, or the hand tool (`H`); `V` puts it down |

The diagram autosaves to browser storage as you work (web and desktop alike) and comes back after
a reload or restart. That draft is local to the machine — save to a `.arq` file to keep or share it.
Copied elements go through the system clipboard, so they paste into another tab or window.

An unsaved diagram shows a `*` after the title. `Ctrl+N` and Open prompt before discarding
unsaved work. Errors from open, save and export appear in a banner under the toolbar rather
than being swallowed.

### The JSON view

The **Canvas / Split / JSON** switch in the toolbar (hover an icon for its name) shows the diagram as JSON — beside the canvas,
or on its own; in the split view, drag the bar between them to share the width. It is the same
JSON a `.arq` file holds, and the two stay in step both ways:

- Type in the JSON and the diagram follows as soon as you pause. Every shape, label, colour, arrow
  end and animation is there to edit. A burst of typing is one `Ctrl+Z`.
- While the JSON is broken the diagram keeps its last good version; each problem is underlined on
  its line and listed under the editor — click one to jump to it.
- Change the diagram on the canvas (or undo, or open a file) and the JSON is rewritten.
- Select a shape or line and its object is highlighted in the JSON and scrolled into view; put
  the cursor inside an object in the JSON and that element is selected on the canvas.

**Shapes don't need positions.** Leave `layout.pinned` out and Arq lays the diagram out with ELK,
flowing in `layout.direction` (`RIGHT`, `DOWN`, `LEFT`, `UP`). Shapes that already have a position
keep it; new ones are placed beside them. **Tidy layout** lays everything out again.

The bar above the editor also has **Copy JSON** and **Download JSON** for the whole document, and a
**Tree** checkbox that swaps the text for a collapsible outline — shapes and lines summarised by
what they are, clicking one selects it. When the JSON has problems, **Copy errors** copies all of
them at once, ready to paste back to an AI.

**Generating a diagram with AI:** click **Copy AI instructions**, paste that into any chat model
followed by what you want drawn, and paste the JSON it returns into the editor. The instructions
are built from the schema itself — every shape, style key and allowed value — so they always
match what this build accepts.

### Exporting

**Export** opens a dialog with a live preview of exactly what will be written:

- **File name** and **format**:
  - **PNG** and **SVG** — a still picture (animations frozen at their first moment). The SVG is
    self-contained: the font and icons are inlined.
  - **Animated SVG** — the vector file that plays its animations by itself in any browser.
  - **GIF** and **MP4** — a recording of the animations. Pick the **frame rate** (12, 20 or 30) and
    the **length**; left at 0 it records exactly one loop, so the file repeats seamlessly. A progress
    line counts the frames as they record. MP4 uses the browser's own video encoder (H.264 where
    available); a transparent background records on the canvas colour, since video has no
    transparency.
- **Background** — plain (the canvas colour), transparent, or the canvas colour with its grid.
- **Theme** — light or dark: the colour of unstyled text and of a canvas with no colour set.
  It starts on the theme you are editing in, so text exports the colour you saw.
- **Area** — the whole diagram, or only the selection.
- **Padding** around the content, and for PNG, GIF and MP4 the **size** (1x–4x); the final pixel
  size is shown.
- **Preview** opens the export full size — fitted to the window or at 100% — before you write it.

Because the canvas and the exporter share one geometry module, exported node sizes and edge
routes match what you saw on screen.

---

## The .arq file format

A diagram is plain JSON, validated by a Zod schema. Files are saved two-space indented, with
arrays in authored order and a trailing newline, so they diff cleanly in git.

```json
{
  "version": 2,
  "kind": "event-flow",
  "title": "Order ingestion",
  "canvasBackground": "#ffffff",
  "nodes": [
    { "id": "oms", "shape": "rect", "label": "OMS", "style": { "fill": "#e8f0fe", "stroke": "#1a73e8" } },
    { "id": "pr", "shape": "ellipse", "label": "PR broker", "meta": { "vpn": "BSE_PROD" } }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "oms",
      "to": "pr",
      "label": "orders/new",
      "style": { "routing": "curved", "endArrow": "arrow", "strokeDash": "dashed" }
    },
    {
      "id": "e2",
      "from": "pr",
      "to": { "x": 480, "y": 260 },
      "style": { "endArrow": "none" }
    }
  ],
  "groups": [{ "id": "dc", "label": "Mumbai DC", "kind": "dc" }],
  "layout": { "pinned": { "oms": { "x": 40, "y": 80 }, "pr": { "x": 300, "y": 120 } } }
}
```

Notes for anyone generating these by hand or by script:

- `node.shape` is one of `rect` · `ellipse` · `diamond` · `triangle` · `text`. There is no
  domain typing left in the schema — `oms` and `pr` above are both just shapes; nothing about
  the document says one is an application and the other a broker beyond the label and `meta`
  you choose to put there.
- `node.style` and `edge.style` are both optional; unset fields fall back to the renderer's
  defaults. There is no more per-type `props` object — anything you'd have put there goes in
  the free-form `meta` map instead (string values only), which nothing in the editor currently
  reads back.
- `edge.from` / `edge.to` are each **either a node id or a loose `{ x, y }` point** (see `e2`
  above), so a free-floating line and a connector are the same shape in the schema. When it's a
  node id, it must name a real node — the schema rejects dangling references and duplicate ids,
  and reports every problem at once rather than stopping at the first.
- `edge.kind` still exists as an optional free-text string for round-tripping older
  documents and future use, but nothing in the editor reads it today; edge appearance comes
  entirely from `edge.style`.
- `layout.pinned` values are **objects** `{ x, y, w?, h? }`, never tuples.
- Group kinds are `region` · `dc` · `vpc` · `cluster` · `zone` · `generic`.
- `canvasBackground` is optional; omit it to use the editor's default background.
- Opening a version 1 document migrates it automatically: typed nodes become rectangles
  carrying a `solace/<type>` icon id, edge kinds map to an equivalent `style`, and every v1
  `props` value is preserved in `meta` rather than silently dropped. Saving always writes
  version 2.
- Undo history and selection are view state and are never written to the file.

---

## Development

### Prerequisites

- **Node 22 or newer**
- **pnpm 10** — `npm i -g pnpm@10`
- **Rust stable** — desktop builds only. `winget install Rustlang.Rustup`, then
  `rustup default stable`. Installing rustup does **not** install a toolchain on its own;
  confirm `rustup show` reports an active one.
- **WebView2** — desktop builds only. Present by default on Windows 11.

### Getting started

```bash
pnpm install
```

```bash
pnpm --filter @arq/web dev
```

That serves the web editor on `http://localhost:5173`.

### Repo layout

```
packages/schema    Zod document schema, parse/serialize/migrate. No DOM.
packages/render    Node metrics, edge geometry, SVG renderer. No DOM, no React.
packages/core      Editor store, React Flow canvas, components, commands.
apps/web           Vite web app + browser Platform (File System Access, IndexedDB).
apps/desktop       Tauri v2 shell + desktop Platform (native dialogs, filesystem).
```

The dependency rule: `schema` and `render` never touch the DOM and never import `core` or the
apps. `core` never imports from `apps/*` — shell access goes through the `Platform` interface
only, which is what lets the same editor run in a browser and in a native window.

### Tests

```bash
pnpm test
```

```bash
pnpm typecheck
```

Playwright end-to-end tests live in the web app. Install the browser once, then run them:

```bash
pnpm --filter @arq/web exec playwright install chromium
```

```bash
pnpm --filter @arq/web e2e
```

The render-parity test asserts that `renderSvg` produces **byte-identical** output in Node and
in the browser, which is what keeps export deterministic across platforms.

CI runs typecheck, unit tests, the web build and the Playwright suite on Windows.

---

## Building the desktop app

```bash
pnpm --filter @arq/desktop tauri dev
```

```bash
pnpm --filter @arq/desktop tauri build
```

Output lands in `apps/desktop/src-tauri/target/release/`, with the NSIS installer under
`bundle/nsis/`. Add `--no-bundle` to produce just the executable and skip the installer. The
first compile pulls several hundred crates and takes a few minutes; later builds are under a
minute.

App icons regenerate from the committed source image:

```bash
cd apps/desktop && pnpm exec tauri icon icon-src.png --output src-tauri/icons
```

The CLI also emits Android and iOS icon sets. Phase 1 targets Windows only, so those are not
committed.

---

## Contributing

Contributions are welcome. Conventions this repo follows:

- **TypeScript strict.** No `any` outside parser boundaries, and each such use carries a
  comment explaining why.
- **The Zod schema is the single source of types.** TypeScript types are inferred from it,
  never duplicated by hand.
- **Conventional commit messages** (`feat:`, `fix:`, `test:`, `docs:`, `ci:`).
- **Tests belong with the change.** Non-trivial logic ships with a test that fails if the
  logic breaks.
- Run `pnpm test` and `pnpm typecheck` before opening a pull request.

Please open an issue before starting anything large, so the approach can be agreed first.

---

## Roadmap

Phases 1 and 2 are complete. What exists today, and what does not:

| Area | State |
|---|---|
| Document schema, parse/serialize/migrate (v1 → v2) | Built |
| Editor store, undo/redo, selection | Built |
| Generic shape model — nodes, styled edges, point endpoints | Built |
| Canvas, palette (7 shapes), pan/zoom navigation | Built |
| Inspector panel (document and per-selection styling) | Built |
| Settings panel (theme, grid, snap, creation defaults) | Built |
| Toolbar, file lifecycle, keyboard shortcuts | Built |
| SVG and PNG export, `canvasBackground` | Built |
| Web app and Windows desktop app | Built |
| Icon-pack import (draw.io libraries) | Not built |
| Group editing on the canvas | Not built |
| Automatic layout (ELK, JSON view and Tidy layout) | Built |
| Animated edges | Built |
| JSON view, two-way sync, AI instructions | Built |
| In-app AI generation (prompt → diagram) | Not built |
| Live broker metrics | Not built |

`PROJECT.md` holds the full design rationale and the longer-term plan.

---

## Security

Arq opens files that other people may have authored, so some things are deliberate:

- Exported SVG is escaped and filtered — event handlers and link attributes on icon artwork
  are stripped rather than carried into the output.
- The desktop app runs under a restrictive Content Security Policy, and validates every path
  segment before writing icon-pack files so a crafted pack cannot escape its directory.
- No telemetry, and none is planned without being opt-in and documented.

Icon-pack import is not built yet. When it lands it must ship with the import-time sanitizer
described in the design spec, in the same change — the editor renders icon SVG into the DOM,
so an unsanitized pack would be a script-execution path.

Found a vulnerability? Please report it through a private security advisory on the repository
rather than a public issue.

---

## Legal and trademarks

**"Solace" and "PubSub+" are trademarks of Solace Corporation.** This project is not
affiliated with, endorsed by, or sponsored by Solace. Both names are used descriptively, to
say what the tool is for.

**No third-party icon artwork is bundled.** Arq ships its own hand-drawn primitive icons.
Vendor icon sets stay with their owners; the icon-pack importer is designed so users bring
their own artwork under whatever terms they received it.

**Bundled third-party material** is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md):
the Excalifont typeface (© 2024 Excalidraw, SIL OFL 1.1), embedded into exported SVGs so a
diagram renders the same on a machine that does not have it installed, and rough.js (MIT) for
the hand-drawn geometry. "Excalifont" is a trademark of Excalidraw; Arq bundles the font
unmodified and is neither affiliated with nor endorsed by Excalidraw.

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Contributions are accepted under the same license, per Apache-2.0 section 5.
