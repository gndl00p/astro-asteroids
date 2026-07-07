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
  enemies?: boolean;
  enemySpawnScore?: number;
  enemyRespawnMs?: number;
  /** On-screen buttons for touch devices. Default: auto (on for coarse pointers). */
  touchControls?: boolean;
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
interface Enemy { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; fireCooldown: number; t: number; }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; ttl: number; }

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
  touchEl: HTMLDivElement | null;
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
  "[data-asteroids-hud]", "[data-asteroids-hud] *",
  "[data-rt-debris]",
  "[data-rt-crt]",
  "[data-rt-boot]", "[data-rt-boot] *",
  "[data-rt-complete]", "[data-rt-complete] *",
  "[data-rt-touch]", "[data-rt-touch] *",
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
    enemies: opts.enemies ?? true,
    enemySpawnScore: opts.enemySpawnScore ?? 500,
    enemyRespawnMs: opts.enemyRespawnMs ?? 10000,
    touchControls: opts.touchControls ?? isTouchDevice(),
  };
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    // Auto-on only for a genuinely touch-primary device: coarse pointer and no
    // fine pointer. A touchscreen laptop driven by mouse/trackpad reports BOTH
    // coarse and fine, so it stays keyboard/mouse and never gets the overlay.
    return window.matchMedia("(pointer: coarse)").matches &&
      !window.matchMedia("(pointer: fine)").matches;
  }
  // No matchMedia (ancient browsers): fall back to raw touch capability.
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
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
    @keyframes rt-glitch {
      0%, 100% { filter: none; }
      20% { filter: hue-rotate(80deg) contrast(1.6) saturate(2); }
      40% { filter: invert(0.15) saturate(1.4); }
      60% { filter: hue-rotate(-40deg) contrast(1.2); }
      80% { filter: brightness(0.85) saturate(1.8); }
    }
    body.rt-glitched { animation: rt-glitch 240ms steps(5); }
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
  let updateHud: () => void = () => { /* no-op when hud hidden */ };
  if (!o.hideHud) {
    stat = document.createElement("div");
    stat.setAttribute("data-asteroids-hud", "");
    Object.assign(stat.style, {
      position: "fixed", top: "12px", right: "12px", zIndex: "100000",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "11px", lineHeight: "1.5", letterSpacing: "0.18em", color: o.shipColor,
      textTransform: "uppercase", background: "rgba(10,10,10,0.85)",
      padding: "12px 14px 10px", border: "1px solid " + o.shipColor, pointerEvents: "none",
      minWidth: "180px", textAlign: "right",
    });

    const scoreLabel = document.createElement("div");
    scoreLabel.textContent = "SCORE";
    scoreLabel.style.cssText = "font-size:9px;letter-spacing:0.32em;opacity:0.6;margin-bottom:6px;";
    stat.appendChild(scoreLabel);

    const scoreRow = document.createElement("div");
    scoreRow.style.cssText = "display:flex;justify-content:flex-end;gap:2px;margin-bottom:10px;";
    const SCORE_DIGITS = 6;
    const SCORE_CELL_H = 22;
    const scoreCells: HTMLDivElement[] = [];
    for (let i = 0; i < SCORE_DIGITS; i++) {
      const cell = document.createElement("div");
      cell.style.cssText =
        "width:16px;height:" + SCORE_CELL_H + "px;overflow:hidden;" +
        "background:rgba(0,0,0,0.6);border:1px solid currentColor;" +
        "box-shadow:inset 0 0 6px rgba(0,0,0,0.75);" +
        "font-size:15px;letter-spacing:0;text-align:center;" +
        "font-variant-numeric:tabular-nums;";
      const strip = document.createElement("div");
      strip.style.cssText =
        "transition:transform 380ms cubic-bezier(.22,1.4,.36,1);will-change:transform;";
      for (let n = 0; n < 10; n++) {
        const digit = document.createElement("div");
        digit.textContent = String(n);
        digit.style.cssText = "height:" + SCORE_CELL_H + "px;line-height:" + SCORE_CELL_H + "px;";
        strip.appendChild(digit);
      }
      strip.dataset.cur = "0";
      cell.appendChild(strip);
      scoreRow.appendChild(cell);
      scoreCells.push(strip);
    }
    stat.appendChild(scoreRow);

    const timeRow = document.createElement("div");
    const comboRow = document.createElement("div");
    comboRow.style.display = "none";
    const muteRow = document.createElement("div");
    muteRow.style.cssText = "margin-top:4px;opacity:0.55;font-size:10px;";
    stat.appendChild(timeRow);
    stat.appendChild(comboRow);
    stat.appendChild(muteRow);
    document.body.appendChild(stat);

    updateHud = () => {
      const elapsed = Math.floor((performance.now() - score.startTime) / 1000);
      const mm = String(Math.floor(elapsed / 60));
      const ss = String(elapsed % 60).padStart(2, "0");
      timeRow.textContent = `TIME ${mm}:${ss}`;
      muteRow.textContent = state?.muted ? "[M:OFF]" : "[M:ON]";
      if (score.combo > 1) {
        comboRow.style.display = "";
        comboRow.textContent = `COMBO x${score.combo}`;
      } else {
        comboRow.style.display = "none";
      }
      stat!.style.color = score.combo > 2 ? o.accentColor : o.shipColor;
      stat!.style.borderColor = score.combo > 2 ? o.accentColor : o.shipColor;
      const digits = String(score.destroyed).padStart(SCORE_DIGITS, "0");
      for (let i = 0; i < SCORE_DIGITS; i++) {
        const d = digits[i];
        const strip = scoreCells[i];
        if (strip.dataset.cur !== d) {
          strip.dataset.cur = d;
          strip.style.transform = `translateY(-${parseInt(d, 10) * SCORE_CELL_H}px)`;
        }
      }
    };
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
    invulnUntil: 0,
  };

  const keys: Record<string, boolean> = Object.create(null);
  const bullets: Bullet[] = [];
  const particles: Particle[] = [];
  const debris: Debris[] = [];
  const rings: Ring[] = [];
  const pickups: Pickup[] = [];
  const enemies: Enemy[] = [];
  const enemyBullets: EnemyBullet[] = [];
  let enemyNextEligibleAt = 0;
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
    canvas, banner, stat, crt, bootEl: null, completeEl: null, touchEl: null,
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
      document.querySelectorAll("[data-rt-touch]").forEach((n) => n.remove());
      document.documentElement.classList.remove("rt-asteroids-active");
    },
  };

  if (o.touchControls) buildTouchControls();

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
      if (ship.vy < 0) {
        const baseWant = Math.abs(ship.vy) * o.scrollAmp;
        const want = (thrusting ? Math.max(baseWant, o.scrollMin) : baseWant) * fdt;
        const canScroll = Math.min(window.scrollY, want);
        if (canScroll > 0) window.scrollBy(0, -canScroll); else ship.vy = 0;
      }
      ship.y = topPad;
    } else if (o.scrollOnEdge && nextY > botPad) {
      if (ship.vy > 0) {
        const baseWant = Math.abs(ship.vy) * o.scrollAmp;
        const want = (thrusting ? Math.max(baseWant, o.scrollMin) : baseWant) * fdt;
        const canScroll = Math.min(docMaxScroll - window.scrollY, want);
        if (canScroll > 0) window.scrollBy(0, canScroll); else ship.vy = 0;
      }
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

    // Saucer spawn / update / collisions
    if (o.enemies) {
      if (enemies.length === 0) {
        const nowMs = performance.now();
        if (enemyNextEligibleAt === 0) {
          if (score.destroyed >= o.enemySpawnScore) spawnSaucer();
        } else if (nowMs >= enemyNextEligibleAt) {
          spawnSaucer();
        }
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.t += fdt;
        const dx = ship.x - e.x;
        e.vx += Math.sign(dx) * 0.006 * fdt;
        if (e.vx > 2.2) e.vx = 2.2;
        if (e.vx < -2.2) e.vx = -2.2;
        e.vy = Math.sin(e.t * 0.04) * 1.4;
        e.x += e.vx * fdt;
        e.y += e.vy * fdt;
        if (e.x < -60) e.x = window.innerWidth + 60;
        if (e.x > window.innerWidth + 60) e.x = -60;
        if (e.y < 60) e.y = 60;
        if (e.y > window.innerHeight - 60) e.y = window.innerHeight - 60;

        e.fireCooldown -= fdt;
        if (e.fireCooldown <= 0) {
          e.fireCooldown = 100 + Math.random() * 40;
          const ang = Math.atan2(ship.y - e.y, ship.x - e.x) + (Math.random() - 0.5) * 0.32;
          enemyBullets.push({
            x: e.x, y: e.y + 4,
            vx: Math.cos(ang) * 4,
            vy: Math.sin(ang) * 4,
            ttl: 140,
          });
          playEnemyShoot();
        }

        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          const ddx = b.x - e.x;
          const ddy = b.y - e.y;
          if (ddx * ddx + ddy * ddy < 20 * 20) {
            bullets.splice(j, 1);
            e.hp -= 1;
            for (let k = 0; k < 6; k++) {
              const a = Math.random() * Math.PI * 2;
              const spd = 1 + Math.random() * 2;
              particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 22 });
            }
            playHit();
            if (e.hp <= 0) {
              score.destroyed += 200;
              for (let k = 0; k < 28; k++) {
                const a = Math.random() * Math.PI * 2;
                const spd = 2 + Math.random() * 4;
                particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 52 });
              }
              rings.push({ x: e.x, y: e.y, r: 6, speed: 5, life: 32, maxLife: 32, color: o.accentColor });
              rings.push({ x: e.x, y: e.y, r: 3, speed: 3.4, life: 26, maxLife: 26, color: o.particleColor });
              playSaucerKill();
              enemies.splice(i, 1);
              enemyNextEligibleAt = performance.now() + o.enemyRespawnMs;
              break;
            }
          }
        }
      }

      const nowShip = performance.now();
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * fdt; b.y += b.vy * fdt; b.ttl -= fdt;
        if (b.ttl <= 0 || b.x < 0 || b.y < 0 || b.x > window.innerWidth || b.y > window.innerHeight) {
          enemyBullets.splice(i, 1);
          continue;
        }
        if (nowShip < ship.invulnUntil) continue;
        const dx = b.x - ship.x; const dy = b.y - ship.y;
        if (dx * dx + dy * dy < 14 * 14) {
          enemyBullets.splice(i, 1);
          onShipHit();
        }
      }
    }

    render(ship, bullets, particles, debris, rings, pickups, enemies, enemyBullets, ctx, o, SHIP_SIZE);
    updateHud();

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

  function buildTouchControls() {
    const wrapEl = document.createElement("div");
    wrapEl.setAttribute("data-rt-touch", "");
    wrapEl.setAttribute("data-rt-touch-play", "");   // gameplay cluster; hidden on MISSION COMPLETE
    Object.assign(wrapEl.style, {
      position: "fixed", inset: "0", zIndex: "100000",
      pointerEvents: "none", touchAction: "none",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    } as Partial<CSSStyleDeclaration>);

    // Retune banner copy for touch (arrow-key hints don't apply).
    if (banner) banner.textContent = "DESTROY-SITE.BIN · TAP TO FLY · ♪ MUTE · ✕ EXIT";

    const IDLE_BG = "rgba(10,10,10,0.62)";
    const held: Record<string, Set<number>> = Object.create(null);

    // Build a pressable control. onDown/onUp fire on the first-down / last-up
    // so multi-finger jitter on one button doesn't drop the hold. `color`
    // themes the border, text, and pressed-state tint (color-mix accepts any
    // CSS color, so 3-digit hex / rgb() / named colors all tint correctly).
    function mkBtn(label: string, id: string, onDown: () => void, onUp?: () => void, big = false, color: string = o.shipColor) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", id);
      btn.textContent = label;
      const size = big ? "84px" : "60px";
      const pressedBg = "color-mix(in srgb, " + color + " 30%, #0A0A0A)";
      Object.assign(btn.style, {
        pointerEvents: "auto", touchAction: "none", userSelect: "none",
        WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent",
        minWidth: size, minHeight: size, padding: "0 4px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "inherit", fontSize: big ? "16px" : "22px", lineHeight: "1",
        letterSpacing: "0.04em", textTransform: "uppercase",
        color: color, background: IDLE_BG,
        border: "1px solid " + color, borderRadius: "12px",
        cursor: "pointer", backdropFilter: "blur(2px)",
      } as Partial<CSSStyleDeclaration>);
      held[id] = new Set<number>();
      const down = (e: PointerEvent) => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch { /* */ }
        const first = held[id].size === 0;
        held[id].add(e.pointerId);
        btn.style.background = pressedBg;
        if (first) onDown();
      };
      const up = (e: PointerEvent) => {
        e.preventDefault();
        if (!held[id].delete(e.pointerId)) return;
        if (held[id].size === 0) {
          btn.style.background = IDLE_BG;
          onUp?.();
        }
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      return btn;
    }

    const cluster = (side: "left" | "right"): HTMLDivElement => {
      const c = document.createElement("div");
      Object.assign(c.style, {
        position: "absolute",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
        [side]: "calc(env(safe-area-inset-" + side + ", 0px) + 18px)",
        display: "flex", flexDirection: "column", gap: "10px",
        alignItems: side === "left" ? "flex-start" : "flex-end",
        pointerEvents: "none",
      } as Partial<CSSStyleDeclaration>);
      return c;
    };

    const row = (): HTMLDivElement => {
      const r = document.createElement("div");
      Object.assign(r.style, { display: "flex", gap: "10px" } as Partial<CSSStyleDeclaration>);
      return r;
    };

    // Left: rotate + thrust
    const left = cluster("left");
    const rot = row();
    rot.appendChild(mkBtn("◄", "rot-left", () => { keys["ArrowLeft"] = true; }, () => { keys["ArrowLeft"] = false; }));
    rot.appendChild(mkBtn("►", "rot-right", () => { keys["ArrowRight"] = true; }, () => { keys["ArrowRight"] = false; }));
    // The game loop owns the drone (started every frame while ArrowUp is held),
    // matching the keyboard path — the button only sets/clears the key.
    const thrustBtn = mkBtn("▲ THRUST", "thrust",
      () => { keys["ArrowUp"] = true; },
      () => { keys["ArrowUp"] = false; stopDrone(); }, true);
    thrustBtn.style.minWidth = "130px";
    left.appendChild(rot);
    left.appendChild(thrustBtn);

    // Right: fire + warp
    const right = cluster("right");
    if (o.hyperspace) {
      right.appendChild(mkBtn("↯ WARP", "warp", () => doHyperspace(ship), undefined, true));
    }
    const fireBtn = mkBtn("● FIRE", "fire", () => { keys["Space"] = true; }, () => { keys["Space"] = false; }, true, o.particleColor);
    fireBtn.style.minWidth = "112px";
    fireBtn.style.minHeight = "112px";
    fireBtn.style.borderRadius = "50%";
    right.appendChild(fireBtn);

    // Top-left utility stack (exit + mute), clear of banner (center) and HUD (right).
    // z-index above the MISSION COMPLETE overlay (100001) so these stay reachable
    // on touch when the game ends — otherwise the fullscreen complete screen would
    // cover the exit and trap keyboard-less users in a restart loop.
    const topLeft = document.createElement("div");
    topLeft.setAttribute("data-rt-touch", "");   // tagged so cleanup removes it too
    Object.assign(topLeft.style, {
      position: "fixed", zIndex: "100002",
      top: "calc(env(safe-area-inset-top, 0px) + 12px)",
      left: "calc(env(safe-area-inset-left, 0px) + 12px)",
      display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);

    const exitBtn = mkBtn("✕", "exit", () => stop());
    Object.assign(exitBtn.style, { minWidth: "44px", minHeight: "44px", fontSize: "18px", borderRadius: "8px" } as Partial<CSSStyleDeclaration>);

    const muteLabel = () => (state?.muted ? "♪̷" : "♪");
    const muteBtn = mkBtn(muteLabel(), "mute", () => {
      if (state) state.muted = !state.muted;
      stopDrone();                 // kill any running engine drone immediately
      muteBtn.textContent = muteLabel();
      muteBtn.style.opacity = state?.muted ? "0.5" : "1";
    });
    Object.assign(muteBtn.style, { minWidth: "44px", minHeight: "44px", fontSize: "18px", borderRadius: "8px" } as Partial<CSSStyleDeclaration>);

    topLeft.appendChild(exitBtn);
    topLeft.appendChild(muteBtn);

    wrapEl.appendChild(left);
    wrapEl.appendChild(right);
    document.body.appendChild(wrapEl);
    // topLeft mounts at body level (not inside wrapEl) so its z-index competes
    // with the MISSION COMPLETE overlay directly; nested it would be trapped in
    // wrapEl's fixed-position stacking context and stay behind that overlay.
    document.body.appendChild(topLeft);
    if (state) state.touchEl = wrapEl;
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
    const prompt = o.touchControls ? "TAP TO RESTART" : "PRESS R TO RESTART · ESC TO EXIT";
    pre.innerHTML =
      `╔════════════════════════════════════════╗\n` +
      `║         MISSION COMPLETE               ║\n` +
      `╚════════════════════════════════════════╝\n\n` +
      `  TIME       ${mm}:${ss}\n` +
      `  SCORE      ${s.destroyed}\n\n` +
      `  <span class="rt-restart">${prompt}</span>`;
    el.appendChild(pre);
    document.body.appendChild(el);
    state!.completeEl = el;
    if (o.touchControls) {
      // Hide the gameplay buttons so they don't show through as live-looking
      // targets under the overlay; a tap anywhere restarts.
      (document.querySelector("[data-rt-touch-play]") as HTMLElement | null)?.style.setProperty("display", "none");
      el.style.cursor = "pointer";
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); restart(); }, { once: true });
    }
    playComplete();
  }

  function spawnSaucer() {
    const fromLeft = Math.random() < 0.5;
    enemies.push({
      x: fromLeft ? -40 : window.innerWidth + 40,
      y: 100 + Math.random() * (window.innerHeight - 220),
      vx: fromLeft ? 1.6 : -1.6,
      vy: 0,
      hp: 4, maxHp: 4,
      fireCooldown: 70,
      t: 0,
    });
    playSaucerAlarm();
  }

  function onShipHit() {
    score.combo = 1;
    score.multiplier = 1;
    ship.invulnUntil = performance.now() + 1200;
    if (!REDUCED_MOTION) {
      document.body.classList.remove("rt-glitched");
      void document.body.offsetWidth;
      document.body.classList.add("rt-glitched");
      setTimeout(() => document.body.classList.remove("rt-glitched"), 260);
    }
    playGlitchHit();
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
  enemies: Enemy[], enemyBullets: EnemyBullet[],
  ctx: CanvasRenderingContext2D, o: Required<DestroySiteOptions>, SHIP_SIZE: number,
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

  ctx.fillStyle = o.accentColor;
  for (const b of enemyBullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);

  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = o.accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -4, 8, 4, 0, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = o.particleColor;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 110);
    ctx.fillRect(-3, 3, 6, 1.6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.accentColor;
    for (let i = 0; i < e.hp; i++) {
      ctx.fillRect(-((e.maxHp * 4 - 2) / 2) + i * 4, -13, 2.5, 2.5);
    }
    ctx.restore();
  }

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

function playEnemyShoot() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  gain.gain.setValueAtTime(0.045, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.14);
}

function playSaucerAlarm() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const tones = [620, 380];
  tones.forEach((freq, i) => {
    const osc = ac.createOscillator(); const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t + i * 0.18);
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.05, t + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
    osc.connect(gain).connect(ac.destination);
    osc.start(t + i * 0.18); osc.stop(t + i * 0.18 + 0.18);
  });
}

function playSaucerKill() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator(); const gain = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + 0.5);
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(gain).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.55);

  const len = Math.floor(ac.sampleRate * 0.3);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
  const src = ac.createBufferSource(); src.buffer = buf;
  const nGain = ac.createGain();
  nGain.gain.setValueAtTime(0.06, t);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(nGain).connect(ac.destination);
  src.start(t);
}

function playGlitchHit() {
  const ac = ensureAudio(); if (!ac) return;
  const t = ac.currentTime;
  const len = Math.floor(ac.sampleRate * 0.18);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.6);
  const src = ac.createBufferSource(); src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1200, t);
  filter.Q.setValueAtTime(4, t);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.09, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
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
