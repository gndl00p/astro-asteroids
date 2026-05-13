/**
 * astro-asteroids — Astro integration.
 *
 * Usage:
 *   import asteroids from "astro-asteroids";
 *
 *   export default defineConfig({
 *     integrations: [asteroids()],
 *   });
 *
 * Optional config:
 *   asteroids({
 *     trigger: "konami" | "button" | "both",  // default "both"
 *     buttonLabel: "[ destroy-site.bin ]",
 *     buttonSelector: undefined,              // CSS selector to mount in; default appends to <body>
 *     shipColor: "#4DD0E1",
 *     particleColor: "#FF3B30",
 *   })
 */

import type { AstroIntegration } from "astro";
import type { DestroySiteOptions } from "@robbtech/destroy-site";

export interface AsteroidsIntegrationOptions extends DestroySiteOptions {
  /** How the user activates the game. Default 'both'. */
  trigger?: "konami" | "button" | "both";
  /** Footer button label. Default '[ destroy-site.bin ]'. */
  buttonLabel?: string;
  /** Element to inject the launcher button into (CSS selector). Default appended to <body>. */
  buttonSelector?: string;
  /** Konami sequence override. Default Up Up Down Down Left Right Left Right B A. */
  konamiSequence?: string[];
}

const DEFAULT_KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];

export default function asteroids(opts: AsteroidsIntegrationOptions = {}): AstroIntegration {
  const trigger = opts.trigger ?? "both";
  const buttonLabel = opts.buttonLabel ?? "[ destroy-site.bin ]";
  const konami = opts.konamiSequence ?? DEFAULT_KONAMI;
  const startOpts: DestroySiteOptions = {
    shipColor: opts.shipColor,
    particleColor: opts.particleColor,
    banner: opts.banner,
    hideBanner: opts.hideBanner,
    hideHud: opts.hideHud,
    thrust: opts.thrust,
    friction: opts.friction,
    rotationSpeed: opts.rotationSpeed,
    bulletSpeed: opts.bulletSpeed,
    skipSelectors: opts.skipSelectors,
    flashTargets: opts.flashTargets,
  };

  return {
    name: "astro-asteroids",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        const script = buildClientScript({
          trigger,
          buttonLabel,
          buttonSelector: opts.buttonSelector,
          konami,
          startOpts,
        });
        injectScript("page", script);
      },
    },
  };
}

interface ClientOpts {
  trigger: "konami" | "button" | "both";
  buttonLabel: string;
  buttonSelector?: string;
  konami: string[];
  startOpts: DestroySiteOptions;
}

function buildClientScript(c: ClientOpts): string {
  // Inline import of the lib so consumers don't have to also install it explicitly.
  // injectScript("page") gets bundled by Vite, dependency resolution is automatic.
  const start = `start(${JSON.stringify(c.startOpts)})`;
  const konami = JSON.stringify(c.konami);
  const label = JSON.stringify(c.buttonLabel);
  const sel = JSON.stringify(c.buttonSelector ?? "");
  const wantButton = c.trigger === "button" || c.trigger === "both";
  const wantKonami = c.trigger === "konami" || c.trigger === "both";

  return `
import { start } from "@robbtech/destroy-site";

const KONAMI = ${konami};
let buffer = [];
let lastKey = 0;

function fire() {
  ${start};
}

function mountButton() {
  const label = ${label};
  const sel = ${sel};
  const host = sel ? document.querySelector(sel) : document.body;
  if (!host) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-asteroids-launcher", "");
  btn.textContent = label;
  Object.assign(btn.style, {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "11px",
    letterSpacing: "0.28em",
    textTransform: "uppercase",
    background: "transparent",
    border: "0",
    color: "inherit",
    cursor: "pointer",
    padding: "0",
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof btn.blur === "function") btn.blur();
    fire();
  });
  host.appendChild(btn);
}

function init() {
  ${wantButton ? "mountButton();" : ""}
  ${wantKonami ? `
  window.addEventListener("keydown", (e) => {
    const ae = document.activeElement;
    const tag = ae ? ae.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const now = Date.now();
    if (now - lastKey > 2000) buffer = [];
    lastKey = now;
    const expected = KONAMI[buffer.length];
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === expected || (expected && key === expected.toLowerCase())) {
      buffer.push(expected);
      if (buffer.length === KONAMI.length) {
        buffer = [];
        fire();
      }
    } else {
      buffer = [];
    }
  });
  ` : ""}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
`;
}
