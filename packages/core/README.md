# @robbtech/destroy-site

Asteroids spaceship overlay that lets visitors shoot and destroy elements on
any web page. Pure vanilla JavaScript, no dependencies. Refresh restores
everything — nothing persists.

## Install

```sh
npm install @robbtech/destroy-site
```

## Usage

### As a module

```ts
import { start, stop } from "@robbtech/destroy-site";

document.querySelector("#play")?.addEventListener("click", () => start());
```

### As a script tag

```html
<script type="module">
  import "@robbtech/destroy-site/browser";
</script>
<button onclick="window.__destroySite()">Play</button>
```

## Options

```ts
start({
  shipColor: "#4DD0E1",
  particleColor: "#FF3B30",
  banner: "DESTROY-SITE.BIN · ← → ROTATE · ↑ THRUST · SPACE FIRE · ESC EXIT",
  hideBanner: false,
  hideHud: false,
  thrust: 0.04,
  friction: 0.985,
  rotationSpeed: 0.022,
  bulletSpeed: 8,
  skipSelectors: ["[data-no-destroy]", ".sticky-nav"],
  flashTargets: true,
  touchControls: undefined,   // undefined = auto (on for touch-primary devices)
});
```

## Controls

Keyboard:

- ← / → rotate
- ↑ thrust
- Space fire
- ESC exit

Touch (auto-enabled on touch-primary devices, or force with `touchControls: true`):
on-screen ◄ ► rotate, THRUST, FIRE, WARP buttons plus ✕ exit and ♪ mute. Auto-detection
uses a coarse-and-not-fine pointer, so a mouse-driven touchscreen laptop keeps the keyboard UI.

## How it picks targets

Walks the DOM, keeps any visible element that has its own text content (a
paragraph, heading, link, list item, label) or is a visual atom (`<img>`,
`<svg>`, `<video>`, `<canvas>`, `<hr>`). Skips containers larger than 55% of
the viewport in both axes so a single shot doesn't wipe a whole section.

Rebuilds the target list on scroll and resize.

## License

MIT — Copyright (c) 2026 Robb Technology Group, LLC
