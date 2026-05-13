/**
 * @robbtech/destroy-site
 *
 * Asteroids spaceship overlay. Pure vanilla, no deps.
 * Call start() to spawn, stop() to clean up. Refresh restores everything.
 *
 * Controls (default):
 *   ← / →   rotate
 *   ↑       thrust
 *   Space   shoot
 *   ESC     exit
 */

export interface DestroySiteOptions {
  /** Color of ship + bullets. Default '#4DD0E1' */
  shipColor?: string;
  /** Color of particle burst on hit. Default '#FF3B30' */
  particleColor?: string;
  /** Banner text top-center. Default 'DESTROY-SITE.BIN' */
  banner?: string;
  /** Hide the banner entirely. Default false */
  hideBanner?: boolean;
  /** Hide the TARGETS/BULLETS HUD. Default false */
  hideHud?: boolean;
  /** Thrust per frame (acceleration). Default 0.04 */
  thrust?: number;
  /** Per-frame velocity decay multiplier. Default 0.985 */
  friction?: number;
  /** Rotation speed in rad/frame. Default 0.022 */
  rotationSpeed?: number;
  /** Bullet velocity in px/frame. Default 8 */
  bulletSpeed?: number;
  /** CSS selectors to skip when collecting targets. */
  skipSelectors?: string[];
  /** Flash dashed outlines on shootable targets when starting. Default true */
  flashTargets?: boolean;
}

interface State {
  canvas: HTMLCanvasElement;
  banner: HTMLDivElement | null;
  stat: HTMLDivElement | null;
  targets: { el: Element }[];
  cleanup: () => void;
}

const VISUAL_TAGS = new Set(["IMG", "VIDEO", "CANVAS", "PICTURE", "HR"]);

let state: State | null = null;

function hasOwnVisibleText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? "").trim().length > 0) return true;
  }
  return false;
}

function collectTargets(skip: string[]): { el: Element }[] {
  const skipMatch = (el: Element) =>
    skip.some((s) => (el as Element & { matches: (s: string) => boolean }).matches?.(s));

  const targets: { el: Element }[] = [];
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

    targets.push({ el });
  }
  return targets;
}

function pruneDetached(targets: { el: Element }[]) {
  for (let i = targets.length - 1; i >= 0; i--) {
    if (!targets[i].el.isConnected) targets.splice(i, 1);
  }
}

function wrap(v: number, max: number): number {
  if (v < 0) return v + max;
  if (v > max) return v - max;
  return v;
}

function findHit(x: number, y: number, targets: { el: Element }[]): { el: Element; idx: number } | null {
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i].el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return { el: targets[i].el, idx: i };
    }
  }
  return null;
}

function destroyElement(el: Element, hitX: number, hitY: number, particles: Particle[], color: string) {
  for (let i = 0; i < 10; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 2.5;
    particles.push({ x: hitX, y: hitY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 30 });
  }
  void color;
  const e = el as HTMLElement;
  e.style.transition = "transform 220ms cubic-bezier(0.2, 0.7, 0.1, 1), opacity 220ms linear";
  e.style.transformOrigin = "center";
  e.style.transform = "scale(0.001) rotate(15deg)";
  e.style.opacity = "0";
  e.style.pointerEvents = "none";
  setTimeout(() => { try { el.remove(); } catch { /* noop */ } }, 240);
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; ttl: number; }

const DEFAULT_SKIP = [
  "#rt-asteroids-canvas",
  "[data-asteroids-canvas]",
  "[data-asteroids-banner]",
  "[data-asteroids-hud]",
  "script",
  "style",
  "noscript",
  "svg defs",
  "svg defs *",
];

export function start(opts: DestroySiteOptions = {}): void {
  if (state) return;

  const shipColor = opts.shipColor ?? "#4DD0E1";
  const particleColor = opts.particleColor ?? "#FF3B30";
  const bannerText = opts.banner ?? "DESTROY-SITE.BIN · ← → ROTATE · ↑ THRUST · SPACE FIRE · ESC EXIT";
  const thrust = opts.thrust ?? 0.04;
  const friction = opts.friction ?? 0.985;
  const rotSpeed = opts.rotationSpeed ?? 0.022;
  const bulletSpeed = opts.bulletSpeed ?? 8;
  const bulletTtl = 90;
  const shipSize = 14;
  const skip = [...DEFAULT_SKIP, ...(opts.skipSelectors ?? [])];

  const canvas = document.createElement("canvas");
  canvas.id = "rt-asteroids-canvas";
  canvas.setAttribute("data-asteroids-canvas", "");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "99999",
    pointerEvents: "none",
  });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  const dpr = () => window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = window.innerWidth * dpr();
    canvas.height = window.innerHeight * dpr();
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  };
  resize();

  let bannerEl: HTMLDivElement | null = null;
  if (!opts.hideBanner) {
    bannerEl = document.createElement("div");
    bannerEl.setAttribute("data-asteroids-banner", "");
    Object.assign(bannerEl.style, {
      position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
      zIndex: "100000", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "11px", letterSpacing: "0.32em", color: shipColor,
      textTransform: "uppercase", background: "rgba(10,10,10,0.85)",
      padding: "8px 14px", border: "1px solid " + shipColor, pointerEvents: "none",
    });
    bannerEl.textContent = bannerText;
    document.body.appendChild(bannerEl);
  }

  let statEl: HTMLDivElement | null = null;
  if (!opts.hideHud) {
    statEl = document.createElement("div");
    statEl.setAttribute("data-asteroids-hud", "");
    Object.assign(statEl.style, {
      position: "fixed", top: "12px", right: "12px", zIndex: "100000",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "10px", letterSpacing: "0.28em", color: shipColor,
      textTransform: "uppercase", background: "rgba(10,10,10,0.85)",
      padding: "8px 14px", border: "1px solid " + shipColor, pointerEvents: "none",
    });
    document.body.appendChild(statEl);
  }

  if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === "function") {
    (document.activeElement as HTMLElement).blur();
  }

  const targets = collectTargets(skip);

  if (opts.flashTargets !== false) {
    for (const t of targets) {
      const e = t.el as HTMLElement;
      const prev = e.style.outline;
      e.style.outline = `1px dashed ${shipColor}`;
      e.style.outlineOffset = "1px";
      setTimeout(() => { try { e.style.outline = prev || ""; e.style.outlineOffset = ""; } catch { /* */ } }, 800);
    }
  }

  const ship = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  const keys: Record<string, boolean> = Object.create(null);
  const bullets: Bullet[] = [];
  const particles: Particle[] = [];
  let shotCooldown = 0;
  let raf = 0;
  let stopped = false;

  const isOurKey = (k: string) =>
    k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" ||
    k === " " || k === "Space" || k === "Spacebar";

  const norm = (k: string) => (k === " " || k === "Spacebar" ? "Space" : k);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); stop(); return; }
    if (isOurKey(e.key)) { e.preventDefault(); keys[norm(e.key)] = true; }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (isOurKey(e.key)) { e.preventDefault(); keys[norm(e.key)] = false; }
  }
  function onResize() {
    resize();
    if (state) state.targets = collectTargets(skip);
  }
  function onScroll() {
    if (state) state.targets = collectTargets(skip);
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });

  function step() {
    if (stopped) return;

    if (keys["ArrowLeft"])  ship.angle -= rotSpeed;
    if (keys["ArrowRight"]) ship.angle += rotSpeed;
    if (keys["ArrowUp"]) {
      ship.vx += Math.cos(ship.angle) * thrust;
      ship.vy += Math.sin(ship.angle) * thrust;
    }
    ship.vx *= friction;
    ship.vy *= friction;
    ship.x = wrap(ship.x + ship.vx, window.innerWidth);
    ship.y = wrap(ship.y + ship.vy, window.innerHeight);

    if (shotCooldown > 0) shotCooldown--;
    if (keys["Space"] && shotCooldown === 0) {
      bullets.push({
        x: ship.x + Math.cos(ship.angle) * shipSize,
        y: ship.y + Math.sin(ship.angle) * shipSize,
        vx: Math.cos(ship.angle) * bulletSpeed + ship.vx,
        vy: Math.sin(ship.angle) * bulletSpeed + ship.vy,
        ttl: bulletTtl,
      });
      shotCooldown = 6;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx; b.y += b.vy; b.ttl--;
      if (b.ttl <= 0 || b.x < 0 || b.y < 0 || b.x > window.innerWidth || b.y > window.innerHeight) {
        bullets.splice(i, 1);
        continue;
      }
      const hit = findHit(b.x, b.y, state!.targets);
      if (hit) {
        destroyElement(hit.el, b.x, b.y, particles, particleColor);
        state!.targets.splice(hit.idx, 1);
        bullets.splice(i, 1);
        pruneDetached(state!.targets);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.95; p.vy *= 0.95;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.fillStyle = shipColor;
    for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 30);
      ctx.fillStyle = particleColor;
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    if (statEl) statEl.textContent = `TARGETS ${state!.targets.length} · BULLETS ${bullets.length}`;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.strokeStyle = shipColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(shipSize, 0);
    ctx.lineTo(-shipSize * 0.7, shipSize * 0.6);
    ctx.lineTo(-shipSize * 0.4, 0);
    ctx.lineTo(-shipSize * 0.7, -shipSize * 0.6);
    ctx.closePath();
    ctx.stroke();
    if (keys["ArrowUp"]) {
      ctx.beginPath();
      ctx.moveTo(-shipSize * 0.4, shipSize * 0.3);
      ctx.lineTo(-shipSize * 1.0, 0);
      ctx.lineTo(-shipSize * 0.4, -shipSize * 0.3);
      ctx.strokeStyle = particleColor;
      ctx.stroke();
    }
    ctx.restore();

    raf = requestAnimationFrame(step);
  }

  state = {
    canvas, banner: bannerEl, stat: statEl, targets,
    cleanup: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      canvas.remove();
      bannerEl?.remove();
      statEl?.remove();
    },
  };

  step();
}

export function stop(): void {
  if (!state) return;
  state.cleanup();
  state = null;
}

export function isActive(): boolean {
  return state !== null;
}
