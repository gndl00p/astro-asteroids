# astro-asteroids

An Astro integration that drops a destroy-the-site Asteroids easter egg into
any Astro project. Konami code or footer button activation. Pure vanilla JS
overlay, no framework dependency. Refresh restores everything.

## Install

```sh
npm install astro-asteroids @robbtech/destroy-site
```

## Usage

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import asteroids from "astro-asteroids";

export default defineConfig({
  integrations: [
    asteroids(),
  ],
});
```

That's it. Konami code (↑↑↓↓←→←→BA) anywhere on the site spawns the ship.
A `[ destroy-site.bin ]` button is appended to `<body>`.

## Configuration

```ts
asteroids({
  trigger: "both",                          // "konami" | "button" | "both"
  buttonLabel: "[ destroy-site.bin ]",      // footer button text
  buttonSelector: "footer .ops",            // CSS selector to mount the button in; default appends to <body>
  konamiSequence: ["k","i","l","l"],        // override the activation key sequence
  shipColor: "#4DD0E1",                     // ship + bullet color
  particleColor: "#FF3B30",                 // hit particle color
  banner: "DESTROY-SITE.BIN · ...",         // top banner text
  hideBanner: false,
  hideHud: false,                           // 'TARGETS N · BULLETS N' counter
  thrust: 0.04,
  friction: 0.985,
  rotationSpeed: 0.022,
  bulletSpeed: 8,
  skipSelectors: ["[data-no-destroy]"],     // CSS selectors of elements to NOT shoot
  flashTargets: true,                       // dashed outline pulse on start
});
```

## Controls

- ← / → rotate
- ↑ thrust
- Space fire
- ESC exit

## How target selection works

The script walks the live DOM and picks every visible element that has its
own text content (paragraph, heading, link, list item) or is a visual atom
(`<img>`, `<svg>`, `<video>`, `<canvas>`, `<hr>`). It skips containers larger
than 55% of the viewport so a single shot doesn't wipe a whole section.

The target list rebuilds on scroll and resize so shooting below the fold
still works.

## License

MIT — Copyright (c) 2026 Philip Robb
