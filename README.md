# astro-asteroids

> Asteroids spaceship overlay that lets visitors shoot every element on your site. One line in `astro.config`. Refresh restores everything.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A two-package monorepo:

| Package | What it is |
|---|---|
| [`@robbtech/destroy-site`](./packages/core) | Framework-agnostic vanilla JS lib. Works on any HTML page. |
| [`astro-asteroids`](./packages/astro) | One-line Astro integration wrapping the core. |

## Quick start (Astro)

```sh
npm install astro-asteroids @robbtech/destroy-site
```

```ts
// astro.config.mjs
import asteroids from "astro-asteroids";

export default defineConfig({
  integrations: [asteroids()],
});
```

That's it. Konami code (↑↑↓↓←→←→BA) anywhere on the site spawns the ship. A `[ destroy-site.bin ]` button is appended to `<body>`.

## Quick start (vanilla)

```ts
import { start } from "@robbtech/destroy-site";
document.querySelector("#play")?.addEventListener("click", () => start());
```

## Controls

- ← / → rotate
- ↑ thrust
- Space fire
- ESC exit

## Demo

```sh
bun install
bun run --cwd demo dev
```

Open http://localhost:4321, click the `[ destroy-site.bin ]` button or punch the Konami code.

## How target selection works

Walks the live DOM, keeps every visible element that has its own text (paragraphs, headings, links, list items, labels) or is a visual atom (`<img>`, `<svg>`, `<video>`, `<canvas>`, `<hr>`). Skips containers larger than 55% of the viewport in both axes so one shot never wipes a whole section. Rebuilds the target list on scroll and resize.

## Configuration

See per-package READMEs:
- [`packages/core/README.md`](./packages/core/README.md) — full options API
- [`packages/astro/README.md`](./packages/astro/README.md) — Astro integration options

## License

MIT — Copyright (c) 2026 Robb Technology Group, LLC. Originally extracted from [robb.tech](https://robb.tech).
