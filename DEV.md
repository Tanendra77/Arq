# Arq developer guide

This guide explains how Arq is put together, how to run and test it locally, and
where to make changes. It is written for contributors. For product behaviour and
the `.arq` document format, see [README.md](README.md).

## What is Arq?

Arq is a diagram editor that runs in two forms:

- **Web:** a Vite single-page React application served in a browser.
- **Desktop (Windows):** the same React application inside a native [Tauri v2]
  window. On Windows, Tauri uses WebView2 to display the UI and exposes approved
  native functionality such as file dialogs and filesystem access.

There is one editor implementation, not one per target. The only target-specific
code is the small adapter which talks to the browser or operating system.

```text
apps/web                 apps/desktop
    |                         |
    +------ entry point -------+
                  |
            packages/core       React editor, canvas, controls and commands
                  |
        +---------+----------+
        |                    |
 packages/schema       packages/render
 JSON model + Zod       geometry + standalone SVG output
```

## Prerequisites

- Node.js **22 or newer**
- pnpm **10** (the repository pins `pnpm@10.34.5`)
- For desktop development on Windows: Rust stable and the WebView2 runtime
  (normally already present on Windows 11)

Install dependencies from the repository root:

```powershell
pnpm install
```

To install Rust on Windows, use `winget install Rustlang.Rustup`, then run
`rustup default stable`. Confirm that `rustup show` reports an active toolchain.

## Run the applications

Run these from the repository root unless stated otherwise.

### Web editor

```powershell
pnpm --filter @arq/web dev
```

Vite starts the app at <http://localhost:5173>. It provides hot module reload
while editing TypeScript, React, or CSS files.

### Desktop editor

```powershell
pnpm --filter @arq/desktop tauri dev
```

Tauri starts the desktop Vite server on port `1420`, builds the Rust host if
needed, then opens the native window. The command should be used instead of
running `apps/desktop`'s Vite command alone when testing native file dialogs or
filesystem behaviour.

## Build releases

```powershell
# Build the browser bundle into apps/web/dist
pnpm --filter @arq/web build

# Build the desktop frontend bundle only into apps/desktop/dist
pnpm --filter @arq/desktop build

# Compile and package the Windows desktop app (NSIS installer)
pnpm --filter @arq/desktop tauri build

# Compile the desktop executable but do not create an installer
pnpm --filter @arq/desktop tauri build --no-bundle
```

Tauri build output is under `apps/desktop/src-tauri/target/release/`; the NSIS
installer is under its `bundle/nsis/` directory. A first Rust build can take a
few minutes because Cargo must download and compile dependencies.

`pnpm build` at the root runs each workspace's ordinary `build` script. It does
**not** replace `tauri build`, which is required to make a native executable or
installer.

## Test and check changes

```powershell
# Type-check every workspace
pnpm typecheck

# Run all unit tests
pnpm test

# Run one workspace's tests
pnpm --filter @arq/schema test
pnpm --filter @arq/render test
pnpm --filter @arq/core test
pnpm --filter @arq/web test
pnpm --filter @arq/desktop test
```

Browser end-to-end tests use Playwright and Chromium. Install Chromium once on a
machine, then run the suite:

```powershell
pnpm --filter @arq/web exec playwright install chromium
pnpm --filter @arq/web e2e
```

The e2e command starts (or reuses) the web app at port `5173`. On failure, check
the Playwright report in `apps/web/playwright-report/`.

Before opening a pull request, run:

```powershell
pnpm typecheck
pnpm test
pnpm --filter @arq/web build
pnpm --filter @arq/web e2e
```

Continuous integration runs those checks on Windows, then runs
`pnpm --filter @arq/desktop tauri build --no-bundle` to ensure the native app
still compiles.

## Directory map

```text
apps/
  web/
    src/main.tsx             Web entry point: mounts the shared editor
    src/web-platform.ts      Browser implementation of file/export/icon storage
    src/idb.ts               Minimal IndexedDB key-value wrapper
    e2e/                     Playwright end-to-end tests
    test/                    Web adapter unit tests
    vite.config.ts           Vite and Vitest configuration (port 5173)

  desktop/
    src/main.tsx             Desktop entry point: mounts the shared editor
    src/desktop-platform.ts  Tauri implementation of file/export/icon storage
    src-tauri/               Rust/Tauri native host and packaging configuration
      src/lib.rs             Thin Tauri setup; registers native plugins
      tauri.conf.json        Window, dev/build, CSP, bundle and file association config
      capabilities/          Explicit permissions for Tauri APIs
    test/                    Desktop adapter unit tests
    vite.config.ts           Vite and Vitest configuration (port 1420)

packages/
  schema/
    src/document.ts          Zod document schemas and inferred TypeScript types
    src/serialize.ts         Stable `.arq` JSON serialization
    src/migrate.ts           Version 1 to version 2 migration
    src/shapes.ts            Shape, style, endpoint and group schemas
    test/                    Schema, parse/serialize and migration tests

  render/
    src/metrics.ts           Shared shape sizing and geometry rules
    src/edge-path.ts         Edge routing/path calculation
    src/layout-document.ts   Converts a document to renderable positioned objects
    src/render-svg.ts        Pure document-to-SVG renderer
    src/                     Must remain DOM- and React-free

  core/
    src/mount.tsx            Creates the React root and injects a Platform adapter
    src/platform.ts          Contract implemented by web and desktop adapters
    src/store/               Zustand editor state, undo/redo and React context
    src/components/          Canvas, palette, toolbar, inspector and settings UI
    src/commands/            Open/save/export and keyboard shortcut behaviour
    src/flow/                React Flow conversion and drag payload helpers
    src/icons/               Built-in shape primitives and icon resolving helpers
    src/styles.css           Shared application styling
    test/                    Component, command, store and flow tests

docs/                        Design records, plans and task reports
.github/workflows/ci.yml    Windows CI definition
```

## How desktop and web share code

`packages/core/src/platform.ts` defines the `Platform` interface. It covers
operations where a browser and a native app differ: opening/saving documents,
exporting a file, selecting an icon-pack file, and storing icon packs.

`mountApp(element, platform)` in `packages/core/src/mount.tsx` creates the
shared editor and provides that adapter to all UI components. Core must never
import `apps/web` or `apps/desktop` directly.

| Need | Web adapter | Desktop adapter |
|---|---|---|
| Open document | HTML file input | Native Tauri open dialog + filesystem |
| Save/export | Browser download | Native save dialog + filesystem |
| Icon-pack storage | IndexedDB | `%APPDATA%` application-data directory |
| User interface | Browser tab | React app inside a Tauri/WebView2 window |

When adding a new OS/browser-specific feature, add it to `Platform`, implement
it in **both** adapters, and keep editor behaviour in `packages/core`.

## Important engineering boundaries

- `packages/schema` owns the `.arq` JSON model. Define or change document data
  here first. Types are inferred from Zod schemas rather than copied by hand.
- `packages/render` is pure TypeScript. It must not read the DOM, browser styles,
  or React state. This keeps SVG exports deterministic on both targets.
- `packages/core` owns interaction and editor state. It can depend on `schema`
  and `render`, but cannot depend on an app wrapper.
- Apps are composition roots and platform adapters. Keep them thin.
- The editor canvas and `renderSvg` share geometry from `render`; do not create
  a second set of sizing or routing rules in a React component.
- Undo/redo and selection are editor view state and are never serialized into a
  `.arq` document.

## Typical changes

### Change the document format

1. Update the relevant Zod schema in `packages/schema/src/`.
2. Add validation, serialization, and migration tests as appropriate.
3. Update render and core code that consumes the changed field.
4. Preserve or update migration from version 1 when compatibility is affected.
5. Update the file-format section in `README.md`.

### Change how something looks or exports

Start in `packages/render`: metrics, path generation, and SVG export are the
source of truth for geometry. Then adjust the relevant core canvas component.
Run the render tests and web e2e parity test so on-screen and exported output
remain aligned.

### Add a browser/native capability

1. Extend `Platform` in `packages/core/src/platform.ts`.
2. Implement the capability in `apps/web/src/web-platform.ts`.
3. Implement it in `apps/desktop/src/desktop-platform.ts`.
4. If the desktop implementation needs a new Tauri plugin or permission, add
   it in `Cargo.toml`, `src/lib.rs`, and the appropriate capability JSON.
5. Add adapter tests for both targets.

Tauri capabilities are security boundaries. Do not broaden filesystem access or
add native permissions without a concrete reason and a narrowly scoped rule.

## Contributing conventions

- Use strict TypeScript. Avoid `any` outside deliberate parsing boundaries.
- Keep tests close to the package that owns the behaviour.
- Use conventional commit prefixes such as `feat:`, `fix:`, `test:`, `docs:`,
  and `ci:`.
- Do not commit generated build output (`dist/`, Rust `target/`, test reports)
  unless a task explicitly requires it.
- Keep product documentation current. `README.md` describes shipped behaviour;
  `PROJECT.md` also contains historical decisions and future planning, so verify
  proposed work against the README and code.

[Tauri v2]: https://v2.tauri.app/
