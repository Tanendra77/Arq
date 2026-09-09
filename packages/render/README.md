# @arq/render

Turns an Arq document into a standalone SVG string. Owns the node metrics table and edge
geometry that the canvas in `@arq/core` also uses, so what is on screen is what exports.

Rules: pure functions only. No DOM, no `getComputedStyle`, no font measurement. Depends on
`@arq/schema` and nothing else. Must never import from `@arq/core` or the apps.

Font: run `pnpm embed-font` after placing `fonts/Inter-Regular.woff2` (SIL OFL 1.1) to embed
Inter in exports. Without it, exports use a system font stack.
