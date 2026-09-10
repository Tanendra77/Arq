# Arq

A desktop and web diagramming tool for event-driven architecture, built around
Solace PubSub+ topologies but usable for any messaging or infrastructure diagram.

Three things make it different from a general-purpose drawing tool:

1. **Schema-aware.** A broker node knows it has VPNs. A queue knows what binds to it.
   The model is semantic, not a bag of rectangles.
2. **JSON in, diagram out.** Diagrams are declarative JSON, so a script or an LLM can
   generate one without ever emitting coordinates.
3. **Screen matches export.** Node metrics and edge geometry live in one package that both
   the canvas and the SVG exporter import, so what you export is what you saw.

> **Status: pre-alpha.** Phase 1 (scaffold, skeleton editor, export) is complete and tested.
> The editor creates, connects, saves and exports diagrams today. Icon-pack import, the
> schema-generated inspector, group editing and flow animation are **not built yet** — see
> [Roadmap](#roadmap).

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

### Creating nodes

The **palette** on the left lists the node types. Either **drag** a type onto the canvas or
**double-click** it to drop one in. Palette items are keyboard reachable — Tab to one and
press **Enter** or **Space**.

Node types:

`broker` · `queue` · `topic` · `app` · `consumer` · `publisher` · `mesh` · `gateway` ·
`store` · `external` · `shape`

### Connecting nodes

Drag from a node's **source handle** to another node's **target handle**. Arq picks the edge
kind from what you connected — an app to a broker becomes `publish`, for example.

Edge kinds:

`publish` · `subscribe` · `bind` · `bridge` · `dmr` · `replication` · `request-reply` ·
`generic`

Each kind renders with its own stroke style; `request-reply` routes back around the nodes
rather than overlapping the outbound edge.

### Moving and deleting

Drag a node to position it. Selected nodes move with the **arrow keys** (1px, or 10px with
**Shift**), and a run of arrow presses collapses into a single undo entry, so one undo reverts
the whole gesture. **Delete** or **Backspace** removes the selection, also as one undo entry.

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
| Duplicate selection | `Ctrl+D` |
| Nudge selection | Arrow keys (`Shift` for 10px) |
| Delete selection | `Delete` / `Backspace` |

An unsaved diagram shows a `*` after the title. `Ctrl+N` and Open prompt before discarding
unsaved work. Errors from open, save and export appear in a banner under the toolbar rather
than being swallowed.

### Exporting

**Export SVG** writes a self-contained `.svg` — icons are inlined, so there are no external
references and the file renders anywhere. **Export PNG** rasterizes that same SVG at the scale
chosen in the adjacent dropdown (1x, 2x or 3x).

Because the canvas and the exporter share one geometry module, exported node sizes and edge
routes match what you saw on screen.

---

## The .arq file format

A diagram is plain JSON, validated by a Zod schema. Files are saved two-space indented, with
arrays in authored order and a trailing newline, so they diff cleanly in git.

```json
{
  "version": 1,
  "kind": "event-flow",
  "title": "Order ingestion",
  "nodes": [
    { "id": "oms", "type": "app", "label": "OMS", "props": {} },
    { "id": "pr", "type": "broker", "label": "PR broker", "props": {} }
  ],
  "edges": [
    { "id": "e1", "from": "oms", "to": "pr", "kind": "publish", "label": "orders/new", "props": {} }
  ],
  "groups": [{ "id": "dc", "label": "Mumbai DC", "kind": "dc" }],
  "layout": { "pinned": { "oms": { "x": 40, "y": 80 }, "pr": { "x": 300, "y": 120 } } }
}
```

Notes for anyone generating these by hand or by script:

- `layout.pinned` values are **objects** `{ x, y, w?, h? }`, never tuples.
- Group kinds are `region` · `dc` · `vpc` · `cluster` · `zone` · `generic`.
- Every `edge.from` and `edge.to` must name a real node. The schema rejects dangling
  references and duplicate ids, and reports every problem at once rather than stopping at the
  first.
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

Phase 1 is complete. What exists today, and what does not:

| Area | State |
|---|---|
| Document schema, parse/serialize/migrate | Built |
| Editor store, undo/redo, selection | Built |
| Canvas, palette, node and edge creation | Built |
| Toolbar, file lifecycle, keyboard shortcuts | Built |
| SVG and PNG export | Built |
| Web app and Windows desktop app | Built |
| Icon-pack import (draw.io libraries) | Not built |
| Schema-generated inspector panel | Not built |
| Group editing on the canvas | Not built |
| Automatic layout | Not built |
| Animated edges | Not built |
| AI diagram generation | Not built |
| Live broker metrics | Not built |

`PROJECT.md` holds the full design rationale and the longer-term plan. Note that it still uses
the retired working name "Meshdraw" in places.

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

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Contributions are accepted under the same license, per Apache-2.0 section 5.
