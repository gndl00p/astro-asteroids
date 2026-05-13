/**
 * @robbtech/destroy-site
 *
 * Asteroids spaceship overlay. Pure vanilla, no deps. TypeScript-typed.
 * Call start() to spawn, stop() to clean up. Refresh restores everything.
 *
 * Controls (default):
 *   ← / →   rotate
 *   ↑       thrust
 *   Space   shoot
 *   M       toggle mute
 *   H       hyperspace warp
 *   R       restart (after MISSION COMPLETE)
 *   ESC     exit
 */

export interface DestroySiteOptions {
  shipColor?: string;
  particleColor?: string;
  accentColor?: string;
  banner?: string;
  hideBanner?: boolean;
  hideHud?: boolean;
  thrust?: number;
  friction?: number;
  rotationSpeed?: number;
  bulletSpeed?: number;
  skipSelectors?: string[];
  flashTargets?: boolean;
  screenShake?: boolean;
  engineTrail?: boolean;
  engineDrone?: boolean;
  crtOverlay?: boolean;
  crosshair?: boolean;
  bootSequence?: boolean;
  scrollOnEdge?: boolean;
  scrollAmp?: number;
  scrollMin?: number;
  powerups?: boolean;
  multiHitHealth?: boolean;
  hyperspace?: boolean;
  comboWindowMs?: number;
}

interface Target {
  el: Element;
  hp?: number;
  lastRect?: DOMRect;
}

interface Bullet { x: number; y: number; vx: number; vy: number; ttl: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; kind?: string; }
interface Debris { x: number; y: number; vx: number; vy: number; angle: number; spin: number; size: number; color: string; life: number; }
interface Ring { x: number; y: number; r: number; speed: number; life: number; maxLife: number; color: string; }
interface Pickup { x: number; y: number; vx: number; vy: number; life: number; }

interface DroneNode {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
}

interface State {
  canvas: HTMLCanvasElement;
  banner: HTMLDivElement | null;
  stat: HTMLDivElement | null;
  crt: HTMLDivElement | null;
  bootEl: HTMLDivElement | null;
  completeEl: HTMLDivElement | null;
  targets: Target[];
  muted: boolean;
  complete: boolean;
  droneNode: DroneNode | null;
  opts: Required<DestroySiteOptions>;
  cleanup: () => void;
}

const VISUAL_TAGS = new Set(["IMG", "VIDEO", "CANVAS", "PICTURE", "HR"]);
const DEFAULT_SKIP = [
  "#rt-asteroids-canvas",
  "[data-asteroids-canvas]",
  "[data-asteroids-banner]",
  "[data-asteroids-hud]",
  "[data-rt-debris]",
  "[data-rt-crt]",
  "[data-rt-boot]", "[data-rt-boot] *",
  "[data-rt-complete]", "[data-rt-complete] *",
  "script", "style", "noscript",
  "svg defs", "svg defs *",
];

let state: State | null = null;
let _audio: AudioContext | null = null;

const REDUCED_MOTION = typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function defaults(opts: DestroySiteOptions): Required<DestroySiteOptions> {
  return {
    shipColor: opts.shipColor ?? "#4DD0E1",
    particleColor: opts.particleColor ?? "#FF3B30",
    accentColor: opts.accentColor ?? "#FFB627",
    banner: opts.banner ?? "DESTROY-SITE.BIN · ←→ ROT · ↑ THRUST · SPC FIRE · H WARP · M MUTE · ESC",
    hideBanner: opts.hideBanner ?? false,
    hideHud: opts.hideHud ?? false,
    thrust: opts.thrust ?? 0.04,
    friction: opts.friction ?? 0.985,
    rotationSpeed: opts.rotationSpeed ?? 0.022,
    bulletSpeed: opts.bulletSpeed ?? 8,
    skipSelectors: opts.skipSelectors ?? [],
    flashTargets: opts.flashTargets ?? true,
    screenShake: opts.screenShake ?? false,
    engineTrail: opts.engineTrail ?? true,
    engineDrone: opts.engineDrone ?? true,
    crtOverlay: opts.crtOverlay ?? true,
    crosshair: opts.crosshair ?? true,
    bootSequence: opts.bootSequence ?? true,
    scrollOnEdge: opts.scrollOnEdge ?? true,
    scrollAmp: opts.scrollAmp ?? 6,
    scrollMin: opts.scrollMin ?? 9,
    powerups: opts.powerups ?? true,
    multiHitHealth: opts.multiHitHealth ?? true,
    hyperspace: opts.hyperspace ?? true,
    comboWindowMs: opts.comboWindowMs ?? 2000,
  };
}

function injectStyles(o: Required<DestroySiteOptions>) {
  if (document.querySelector("#rt-asteroids-styles")) return;
  const style = document.createElement("style");
  style.id = "rt-asteroids-styles";
  style.textContent = `
    @keyframes rt-shake {
      0%, 100% { transform: translate3d(0,0,0); }
      50% { transform: translate3d(-0.5px, 0.5px, 0); }
    }
    body.rt-shaking { animation: rt-shake 80ms ease-out; }
    html.rt-asteroids-active { scroll-behavior: auto !important; }
    html.rt-asteroids-active body { scroll-behavior: auto !important; }
    [data-rt-debris] {
      position: fixed;
      pointer-events: none;
      z-index: 99998;
      will-change: transform, opacity;
      transition: transform 1100ms cubic-bezier(0.4, 0, 0.9, 1), opacity 1100ms linear;
    }
    [data-rt-crt] {
      position: fixed; inset: 0; z-index: 99998;
      pointer-events: none;
      background: repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 3px);
      box-shadow: inset 0 0 220px rgba(77, 208, 225, 0.08);
      mix-blend-mode: multiply;
    }
    [data-rt-boot], [data-rt-complete] {
      position: fixed; inset: 0; z-index: 100001;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: ${o.shipColor};
      background: rgba(10,10,10,0.6);
    }
    [data-rt-complete] { pointer-events: auto; }
    [data-rt-boot] pre, [data-rt-complete] pre {
      margin: 0; padding: 24px 32px;
      border: 1px solid ${o.shipColor};
      background: rgba(10,10,10,0.92);
      font-size: 14px; line-height: 1.6; letter-spacing: 0.04em;
      text-transform: uppercase; white-space: pre;
    }
    [data-rt-complete] pre { font-size: 16px; }
    [data-rt-complete] .rt-restart { color: ${o.accentColor}; }
    @media (prefers-reduced-motion: reduce) {
      body.rt-shaking { animation: none; }
      [data-rt-debris] { transition: opacity 200ms linear; }
    }
  `;
  document.head.appendChild(style);
}

export function start(opts: DestroySiteOptions = {}): void {
  if (state) return;
  const o = defaults(opts);
  injectStyles(o);

  const canvas = document.createElement("canvas");
  canvas.id = "rt-asteroids-canvas";
  canvas.setAttribute("data-asteroids-canvas", "");
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100vw", height: "100vh",
    zIndex: "99999", pointerEvents: "none",
  });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  document.documentElement.classList.add("rt-asteroids-active");

  const ctx = canvas.getContext("2d")!;
  const dpr = () => window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = window.innerWidth * dpr();
    canvas.height = window.innerHeight * dpr();
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  };
  resize();

  let crt: HTMLDivElement | null = null;
  if (o.crtOverlay && !REDUCED_MOTION) {
    crt = document.createElement("div");
    crt.setAttribute("data-rt-crt", "");
    document.body.appendChild(crt);
  }

  let banner: HTMLDivElement | null = null;
  if (!o.hideBanner) {
    banner = document.createElement("div");
    banner.setAttribute("data-asteroids-banner", "");
    Object.assign(banner.style, {
      position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
      zIndex: "100000", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "11px", letterSpacing: "0.32em", color: o.shipColor,
      textTransform: "uppercase", background: "rgba(10,10,10,0.85)",
      padding: "8px 14px", border: "1px solid " + o.shipColor, pointerEvents: "none",
    });
    banner.textContent = o.banner;
    document.body.appendChild(banner);
  }

  let stat: HTMLDivElement | null = null;
  if (!o.hideHud) {
    stat = document.createElement("div");
    stat.setAttribute("data-asteroids-hud", "");
    Object.assign(stat.style, {
      position: "fixed", top: "12px", right: "12px", zIndex: "100000",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "11px", lineHeight: "1.5", letterSpacing: "0.18em", color: o.shipColor,
      textTransform: "uppercase", background: "rgba(10,10,10,0.85)",
      padding: "10px 14px", border: "1px solid " + o.shipColor, pointerEvents: "none",
      minWidth: "200px", textAlign: "right", whiteSpace: "pre",
    });
    document.body.appendChild(stat);
  }

  if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === "function") {
    (document.activeElement as HTMLElement).blur();
  }

  const skipSelectors = [...DEFAULT_SKIP, ...o.skipSelectors];
  const targets = collectTargets(skipSelectors);

  if (o.flashTargets) {
    for (const t of targets) {
      const e = t.el as HTMLElement;
      const prev = e.style.outline;
      e.style.outline = `1px dashed ${o.shipColor}`;
      e.style.outlineOffset = "1px";
      setTimeout(() => { try { e.style.outline = prev || ""; e.style.outlineOffset = ""; } catch { /* */ } }, 800);
    }
  }

  const SHIP_SIZE = 14;
  const BULLET_TTL = 90;

  const ship = {
    x: window.innerWidth / 2, y: window.innerHeight / 2,
    vx: 0, vy: 0, angle: -Math.PI / 2,
    hyperCooldown: 0, hyperAlpha: 1,
    doubleFireUntil: 0,
  };

  const keys: Record<string, boolean> = Object.create(null);
  const bullets: Bullet[] = [];
  const particles: Particle[] = [];
  const debris: Debris[] = [];
  const rings: Ring[] = [];
  const pickups: Pickup[] = [];
  let shotCooldown = 0;
  let raf = 0;
  let stopped = false;
  const totalTargetsAtStart = targets.length;

  const score = {
    destroyed: 0,
    startTime: performance.now(),
    lastKillAt: 0,
    combo: 1,
    endedAt: 0,
    multiplier: 1,
  };

  // Delta-time clock. fdt = "frame-equivalent" delta (1.0 at 60Hz).
  // Keeps the per-frame-tuned defaults (thrust/friction/rotationSpeed) legible
  // while making behavior identical at 60/120/144/240Hz.
  let lastT = performance.now();

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); stop(); return; }
    if (e.key === "r" || e.key === "R") {
      if (state?.complete) { e.preventDefault(); restart(); return; }
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault(); if (state) state.muted = !state.muted; stopDrone(); return;
    }
    if (e.key === "h" || e.key === "H") {
      if (o.hyperspace) { e.preventDefault(); doHyperspace(ship); }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" ||
        e.key === " " || e.key === "Space" || e.key === "Spacebar") {
      e.preventDefault();
      keys[e.key === " " || e.key === "Spacebar" ? "Space" : e.key] = true;
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" ||
        e.key === " " || e.key === "Space" || e.key === "Spacebar") {
      e.preventDefault();
      keys[e.key === " " || e.key === "Spacebar" ? "Space" : e.key] = false;
      if (e.key === "ArrowUp") stopDrone();
    }
  }
  function onResize() {
    resize();
    if (state) state.targets = collectTargets(skipSelectors);
  }
  function onScroll() {
    if (state) state.targets = collectTargets(skipSelectors);
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });

  state = {
    canvas, banner, stat, crt, bootEl: null, completeEl: null,
    targets, muted: false, complete: false, droneNode: null, opts: o,
    cleanup: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stopDrone();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      canvas.remove();
      banner?.remove();
      stat?.remove();
      crt?.remove();
      state?.bootEl?.remove();
      state?.completeEl?.remove();
      document.documentElement.classList.remove("rt-asteroids-active");
    },
  };

  if (o.bootSequence && !REDUCED_MOTION) bootSequence();

  function step() {
    if (stopped) return;

    // dt in seconds; fdt = how many "60Hz frames" elapsed since last tick.
    // Cap to avoid teleports after tab-switch / GC pause.
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const fdt = dt * 60;

    if (keys["ArrowLeft"])  ship.angle -= o.rotationSpeed * fdt;
    if (keys["ArrowRight"]) ship.angle += o.rotationSpeed * fdt;
    if (keys["ArrowUp"]) {
      ship.vx += Math.cos(ship.angle) * o.thrust * fdt;
      ship.vy += Math.sin(ship.angle) * o.thrust * fdt;
      if (o.engineDrone) startDrone();
      if (o.engineTrail && Math.random() < 0.7 * fdt) {
        const rearX = ship.x - Math.cos(ship.angle) * SHIP_SIZE * 0.7;
        const rearY = ship.y - Math.sin(ship.angle) * SHIP_SIZE * 0.7;
        const spread = (Math.random() - 0.5) * 0.5;
        const ang = ship.angle + Math.PI + spread;
        particles.push({
          x: rearX, y: rearY,
          vx: Math.cos(ang) * (0.8 + Math.random()) - ship.vx * 0.3,
          vy: Math.sin(ang) * (0.8 + Math.random()) - ship.vy * 0.3,
          life: 22, kind: "engine",
        });
      }
    }
    const friction = Math.pow(o.friction, fdt);
    ship.vx *= friction;
    ship.vy *= friction;
    ship.x = wrap(ship.x + ship.vx * fdt, window.innerWidth);

    // Edge-driven scroll (only while engine on)
    const SCROLL_MARGIN = 90;
    const topPad = SCROLL_MARGIN;
    const botPad = window.innerHeight - SCROLL_MARGIN;
    const nextY = ship.y + ship.vy * fdt;
    const docMaxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const thrusting = !!keys["ArrowUp"];
    if (o.scrollOnEdge && nextY < topPad) {
      if (thrusting && ship.vy < 0) {
        const want = Math.max(Math.abs(ship.vy) * o.scrollAmp, o.scrollMin) * fdt;
        const canScroll = Math.min(window.scrollY, want);
        if (canScroll > 0) window.scrollBy(0, -canScroll); else ship.vy = 0;
      } else { ship.vy = 0; }
      ship.y = topPad;
    } else if (o.scrollOnEdge && nextY > botPad) {
      if (thrusting && ship.vy > 0) {
        const want = Math.max(Math.abs(ship.vy) * o.scrollAmp, o.scrollMin) * fdt;
        const canScroll = Math.min(docMaxScroll - window.scrollY, want);
        if (canScroll > 0) window.scrollBy(0, canScroll); else ship.vy = 0;
      } else { ship.vy = 0; }
      ship.y = botPad;
    } else {
      ship.y = wrap(nextY, window.innerHeight);
    }

    if (ship.hyperCooldown > 0) ship.hyperCooldown -= fdt;

    if (shotCooldown > 0) shotCooldown -= fdt;
    if (keys["Space"] && shotCooldown <= 0) {
      fireBullet(ship, bullets, SHIP_SIZE, BULLET_TTL, o.bulletSpeed);
      shotCooldown = 6;
      playShoot();
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * fdt; b.y += b.vy * fdt; b.ttl -= fdt;
      if (b.ttl <= 0 || b.x < 0 || b.y < 0 || b.x > window.innerWidth || b.y > window.innerHeight) {
        bullets.splice(i, 1);
        continue;
      }
      const hit = findHit(b.x, b.y, state!.targets);
      if (hit) {
        bullets.splice(i, 1);
        registerHit(hit, b.x, b.y);
      }
    }

    if (o.powerups) {
      // Pickups stored in DOCUMENT coords so they scroll with the page.
      const pickupFriction = Math.pow(0.99, fdt);
      const sX = window.scrollX;
      const sY = window.scrollY;
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        p.x += p.vx * fdt; p.y += p.vy * fdt;
        p.vx *= pickupFriction; p.vy *= pickupFriction;
        p.life -= fdt;
        if (p.life <= 0) { pickups.splice(i, 1); continue; }
        const vx = p.x - sX; const vy = p.y - sY;
        const dx = vx - ship.x; const dy = vy - ship.y;
        if (dx * dx + dy * dy < 26 * 26) {
          ship.doubleFireUntil = performance.now() + 8000;
          pickups.splice(i, 1);
          playPickup();
        }
      }
    }

    const partFricFast = Math.pow(0.92, fdt);
    const partFricSlow = Math.pow(0.95, fdt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * fdt; p.y += p.vy * fdt;
      if (p.kind !== "engine") { p.vx *= partFricSlow; p.vy *= partFricSlow; }
      else { p.vx *= partFricFast; p.vy *= partFricFast; }
      p.life -= fdt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.x += d.vx * fdt; d.y += d.vy * fdt;
      d.vy += 0.18 * fdt;
      d.angle += d.spin * fdt;
      d.life -= fdt;
      if (d.life <= 0 || d.y > window.innerHeight + 40) debris.splice(i, 1);
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.speed * fdt;
      r.life -= fdt;
      if (r.life <= 0) rings.splice(i, 1);
    }

    render(ship, bullets, particles, debris, rings, pickups, ctx, stat, score, totalTargetsAtStart, o, SHIP_SIZE);

    if (state!.targets.length === 0 && !state!.complete) {
      state!.complete = true;
      score.endedAt = performance.now();
      showMissionComplete(score);
    }

    raf = requestAnimationFrame(step);
  }

  function registerHit(hit: { t: Target; idx: number }, x: number, y: number) {
    const t = hit.t;
    if (o.multiHitHealth) {
      t.hp = (t.hp ?? hpFor(t.el)) - 1;
      if (t.hp > 0) {
        flashHit(t.el, o.particleColor);
        playHit();
        return;
      }
    }

    const now = performance.now();
    if (now - score.lastKillAt < o.comboWindowMs) {
      score.combo = Math.min(score.combo + 1, 12);
    } else {
      score.combo = 1;
    }
    score.lastKillAt = now;
    score.destroyed += score.combo;
    score.multiplier = score.combo;

    destroyElement(t.el, x, y, particles, debris, rings, o.particleColor, o.shipColor);
    state!.targets.splice(hit.idx, 1);
    pruneDetached(state!.targets);

    if (o.screenShake) triggerShake();
    playBoom(t.el);

    if (o.powerups && Math.random() < 0.1) {
      const rect = t.lastRect || ({ left: x - 10, top: y - 10, width: 20, height: 20 } as DOMRect);
      pickups.push({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + rect.height / 2 + window.scrollY,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        life: 1500,
      });
    }
  }

  function bootSequence() {
    const el = document.createElement("div");
    el.setAttribute("data-rt-boot", "");
    const pre = document.createElement("pre");
    el.appendChild(pre);
    document.body.appendChild(el);
    state!.bootEl = el;

    const targetsN = state!.targets.length;
    const lines = [
      "> INITIALIZING DESTROY-SITE.BIN ...",
      `> LOADING TARGETS [████████████] ${targetsN} acquired`,
      "> WEAPONS HOT",
    ];

    let lineIdx = 0; let charIdx = 0; let buffer = "";
    const tick = () => {
      if (!state) return;
      if (lineIdx >= lines.length) {
        setTimeout(() => {
          el.style.transition = "opacity 280ms linear";
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 320);
        }, 220);
        return;
      }
      const line = lines[lineIdx];
      if (charIdx < line.length) {
        buffer += line[charIdx]; charIdx++;
        pre.textContent = buffer;
        setTimeout(tick, 14);
      } else {
        buffer += "\n"; lineIdx++; charIdx = 0;
        pre.textContent = buffer;
        setTimeout(tick, 90);
      }
    };
    tick();
  }

  function showMissionComplete(s: typeof score) {
    const elapsed = Math.floor((s.endedAt - s.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    const el = document.createElement("div");
    el.setAttribute("data-rt-complete", "");
    const pre = document.createElement("pre");
    pre.innerHTML =
      `╔════════════════════════════════════════╗\n` +
      `║         MISSION COMPLETE               ║\n` +
      `╚════════════════════════════════════════╝\n\n` +
      `  TIME       ${mm}:${ss}\n` +
      `  SCORE      ${s.destroyed}\n\n` +
      `  <span class="rt-restart">PRESS R TO RESTART · ESC TO EXIT</span>`;
    el.appendChild(pre);
    document.body.appendChild(el);
    state!.completeEl = el;
    playComplete();
  }

  function restart() {
    stop();
    setTimeout(() => start(opts), 50);
  }

  function startDrone() {
    if (state?.muted) return;
    if (state?.droneNode) return;
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(78, ac.currentTime);
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(7, ac.currentTime);
    lfoGain.gain.setValueAtTime(3, ac.currentTime);
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, ac.currentTime + 0.08);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    lfo.start();
    if (state) state.droneNode = { osc, gain, lfo };
  }

  step();
}

export function stop(): void {
  if (!state) return;
  state.cleanup();
  state = null;
}

export function isActive(): boolean { return state !== null; }

function fireBullet(ship: { x: number; y: number; vx: number; vy: number; angle: number; doubleFireUntil: number }, bullets: Bullet[], shipSize: number, ttl: number, bulletSpeed: number) {
  const t = performance.now();
  const isDouble = t < ship.doubleFireUntil;
  const spreads = isDouble ? [-0.18, 0, 0.18] : [0];
  for (const s of spreads) {
    const a = ship.angle + s;
    bullets.push({
      x: ship.x + Math.cos(a) * shipSize,
      y: ship.y + Math.sin(a) * shipSize,
      vx: Math.cos(a) * bulletSpeed + ship.vx,
      vy: Math.sin(a) * bulletSpeed + ship.vy,
      ttl,
    });
  }
}

function doHyperspace(ship: { x: number; y: number; vx: number; vy: number; hyperCooldown: number }) {
  if (ship.hyperCooldown > 0) return;
  ship.x = Math.random() * window.innerWidth;
  ship.y = Math.random() * window.innerHeight;
  ship.vx = 0; ship.vy = 0;
  ship.hyperCooldown = 120;
  playWhoosh();
}

function flashHit(el: Element, color: string) {
  const e = el as HTMLElement;
  const prevFilter = e.style.filter;
  e.style.transition = "filter 60ms linear";
  e.style.filter = `drop-shadow(0 0 8px ${color}) brightness(2)`;
  setTimeout(() => { try { e.style.filter = prevFilter || ""; } catch { /* */ } }, 120);
}

function hpFor(el: Element): number {
  const r = el.getBoundingClientRect();
  const area = r.width * r.height;
  if (area > 60000) return 3;
  if (area > 20000) return 2;
  return 1;
}

function triggerShake() {
  if (REDUCED_MOTION) return;
  document.body.classList.remove("rt-shaking");
  void document.body.offsetWidth;
  document.body.classList.add("rt-shaking");
  setTimeout(() => document.body.classList.remove("rt-shaking"), 80);
}

function wrap(v: number, max: number): number {
  if (v < 0) return v + max;
  if (v > max) return v - max;
  return v;
}

function hasOwnVisibleText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? "").trim().length > 0) return true;
  }
  return false;
}

function collectTargets(skip: string[]): Target[] {
  const skipMatch = (el: Element) =>
    skip.some((s) => (el as Element & { matches: (s: string) => boolean }).matches?.(s));

  const targets: Target[] = [];
  const all = document.body.querySelectorAll("*");
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for (const el of Array.from(all)) {
    if (skipMatch(el)) continue;
    const tag = el.tagName.toUpperCase();
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom < -200 || rect.top > vh + 200) continue;
    if (rect.right < -200 || rect.left > vw + 200) continue;
    if (rect.width > vw * 0.55 && rect.height > vh * 0.55) continue;

    const isVisual = VISUAL_TAGS.has(tag) || tag === "SVG";
    const ownText = hasOwnVisibleText(el);
    if (!isVisual && !ownText) continue;
    if (tag !== "SVG" && (el as Element).closest("svg")) continue;

    targets.push({ el, lastRect: rect });
  }
  return targets;
}

function pruneDetached(targets: Target[]) {
  for (let i = targets.length - 1; i >= 0; i--) {
    if (!targets[i].el.isConnected) targets.splice(i, 1);
  }
}

function findHit(x: number, y: number, targets: Target[]): { t: Target; idx: number } | null {
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i].el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      targets[i].lastRect = r;
      return { t: targets[i], idx: i };
    }
  }
  return null;
}

function destroyElement(el: Element, hitX: number, hitY: number, particles: Particle[], debris: Debris[], rings: Ring[], particleColor: string, shipColor: string) {
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.6 + Math.random() * 3.6;
    particles.push({ x: hitX, y: hitY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 44 });
  }

  rings.push({ x: hitX, y: hitY, r: 4, speed: 4.2, life: 28, maxLife: 28, color: shipColor });
  rings.push({ x: hitX, y: hitY, r: 2, speed: 2.6, life: 22, maxLife: 22, color: particleColor });

  const rect = el.getBoundingClientRect();
  const debrisCount = Math.min(16, Math.max(5, Math.floor(rect.width * rect.height / 4500)));
  for (let i = 0; i < debrisCount; i++) {
    const fx = rect.left + Math.random() * rect.width;
    const fy = rect.top + Math.random() * rect.height;
    debris.push({
      x: fx, y: fy,
      vx: (fx - hitX) / 30 + (Math.random() - 0.5) * 4,
      vy: (fy - hitY) / 30 - 2.5 - Math.random() * 3.5,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.5,
      size: 3 + Math.random() * 6,
      color: Math.random() < 0.7 ? particleColor : shipColor,
      life: 80 + Math.random() * 50,
    });
  }

  const e = el as HTMLElement;
  const clone = e.cloneNode(true) as HTMLElement;
  clone.setAttribute("data-rt-debris", "");
  clone.style.left = rect.left + "px";
  clone.style.top = rect.top + "px";
  clone.style.width = rect.width + "px";
  clone.style.height = rect.height + "px";
  clone.style.margin = "0";
  clone.setAttribute("aria-hidden", "true");
  document.body.appendChild(clone);

  el.remove();

  requestAnimationFrame(() => {
    const spinDeg = (Math.random() * 80 - 40);
    const dx = (Math.random() * 220 - 110);
    const dy = (window.innerHeight - rect.top) + 220;
    clone.style.transform = "translate(" + dx + "px, " + dy + "px) rotate(" + spinDeg + "deg)";
    clone.style.opacity = "0";
  });

  setTimeout(() => { try { clone.remove(); } catch { /* */ } }, 1300);
}

function render(
  ship: { x: number; y: number; angle: number; doubleFireUntil: number; hyperAlpha: number },
  bullets: Bullet[], particles: Particle[], debris: Debris[], rings: Ring[], pickups: Pickup[],
  ctx: CanvasRenderingContext2D, stat: HTMLDivElement | null, score: { destroyed: number; startTime: number; combo: number },
  total: number, o: Required<DestroySiteOptions>, SHIP_SIZE: number,
) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (const r of rings) {
    const a = Math.max(0, r.life / r.maxLife);
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1.5 * a + 0.4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const p of particles) {
    const lifeMax = p.kind === "engine" ? 22 : 40;
    ctx.globalAlpha = Math.max(0, p.life / lifeMax) * (p.kind === "engine" ? 0.7 : 1);
    ctx.fillStyle = o.particleColor;
    const s = p.kind === "engine" ? 1.4 : 2;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  for (const d of debris) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    ctx.globalAlpha = Math.max(0, d.life / 100);
    ctx.fillStyle = d.color;
    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = o.shipColor;
  for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);

  if (o.powerups) {
    const pSx = window.scrollX, pSy = window.scrollY;
    for (const p of pickups) {
      ctx.save();
      ctx.translate(p.x - pSx, p.y - pSy);
      ctx.rotate((performance.now() / 600) % (Math.PI * 2));
      ctx.strokeStyle = o.accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = Math.cos(a) * 12; const y = Math.sin(a) * 12;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(performance.now() / 200);
      ctx.fillStyle = o.accentColor;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  if (o.crosshair) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = o.shipColor;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE + 4, 0);
    ctx.lineTo(SHIP_SIZE + 4 + 130, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = ship.hyperAlpha;

  ctx.strokeStyle = o.shipColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(SHIP_SIZE, 0);
  ctx.lineTo(-SHIP_SIZE * 0.7, SHIP_SIZE * 0.6);
  ctx.lineTo(-SHIP_SIZE * 0.4, 0);
  ctx.lineTo(-SHIP_SIZE * 0.7, -SHIP_SIZE * 0.6);
  ctx.closePath();
  ctx.stroke();

  if (performance.now() < ship.doubleFireUntil) {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = o.accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, SHIP_SIZE + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  if (stat) {
    const elapsed = Math.floor((performance.now() - score.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60));
    const ss = String(elapsed % 60).padStart(2, "0");
    const destroyed = total - (state?.targets.length ?? 0);
    const muteFlag = state?.muted ? "[M:OFF]" : "[M:ON]";
    const comboLine = score.combo > 1 ? `\nCOMBO     x${score.combo}` : "";
    stat.style.color = score.combo > 2 ? o.accentColor : o.shipColor;
    stat.style.borderColor = score.combo > 2 ? o.accentColor : o.shipColor;
    stat.textContent =
      `TARGETS   ${state?.targets.length ?? 0}\n` +
      `DESTROYED ${destroyed}\n` +
      `SCORE     ${score.destroyed}\n` +
      `TIME      ${mm}:${ss}` +
      comboLine + `\n${muteFlag}`;
  }
}

// ── Web Audio ─────────────────────────────────────────────────────────
function ensureAudio(): AudioContext | null {
  if (state?.muted) return null;
  if (_audio) return _audio;
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try { _audio = new Ctx(); } catch { _audio = null; }
  return _audio;
}

function playShoot() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
  gain.gain.setValueAtTime(0.04, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(gain).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.1);
}

function playBoom(el: Element | null) {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  let basePitch = 110;
  if (el) {
    const r = el.getBoundingClientRect();
    const area = (r.width || 100) * (r.height || 30);
    basePitch = Math.max(50, Math.min(220, 50000 / Math.max(1000, area) * 50));
  }
  const endPitch = basePitch * 0.25;

  const osc = ac.createOscillator(); const oscGain = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(basePitch, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endPitch), t + 0.28);
  oscGain.gain.setValueAtTime(0.05, t);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  osc.connect(oscGain).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.32);

  const len = Math.floor(ac.sampleRate * 0.14);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8);
  const src = ac.createBufferSource(); src.buffer = buf;
  const nGain = ac.createGain();
  nGain.gain.setValueAtTime(0.03, t);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  src.connect(nGain).connect(ac.destination);
  src.start(t);
}

function playHit() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.07);
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(gain).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.09);
}

function playPickup() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(gain).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.2);
}

function playWhoosh() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const len = Math.floor(ac.sampleRate * 0.3);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const env = Math.sin((i / len) * Math.PI); d[i] = (Math.random() * 2 - 1) * env; }
  const src = ac.createBufferSource(); src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(200, t);
  filter.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

function playComplete() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const notes = [261.63, 329.63, 392.00, 523.25];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator(); const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t + i * 0.14);
    gain.gain.setValueAtTime(0.0001, t + i * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.08, t + i * 0.14 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(t + i * 0.14); osc.stop(t + i * 0.14 + 0.32);
  });
}

function stopDrone() {
  if (!state?.droneNode) return;
  const ac = _audio;
  if (!ac) { state.droneNode = null; return; }
  const { osc, gain, lfo } = state.droneNode;
  const t = ac.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.stop(t + 0.22);
    lfo.stop(t + 0.22);
  } catch { /* */ }
  state.droneNode = null;
}
