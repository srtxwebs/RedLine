import { SITE, t, esc, reduceMotion, glitchLevel, glitchEl } from "./app.js";
import { applyTranslations, money, locale } from "./i18n.js";
import { fetchPublicListings, cardHTML, wireCards } from "./listings.js";

/* =========================================================
   1) CORRUPTED CODE RAIN (canvas behind the torn paper)
   ========================================================= */
const canvas = document.getElementById("code-rain");
const ctx = canvas.getContext("2d");
const SNIPPETS = [
  "const", "let", "=>", "</div>", "<a href>", "fn()", "0x1F", "null", "void 0", "if(!x)", "return", "async", "await",
  "{ }", "[ ]", "===", "&&", "||", "404", "ERR", "NaN", "0xDEAD", "sudo", "rm -rf", "git push", "npm i", "<html>",
  ".css", ".map()", "eval(", "SYS_FAIL", "undefined", "throw", "#ff2b1c", "while(1)", "segfault", "kernel", "0101",
  "fetch(", "import", "export", "</>", "::", "try{", "catch", "this", "new", "class", "@media", "z-index", "∞"
];
const GLITCH = "▓▒░█▀▄■□◆◇※¥¤§¶╳╱╲┼═║ΞΣΔψ";
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

let W = 0, H = 0, DPR = 1, FS = 16, cols = [], rafId = 0, last = 0, running = false;
let glitchUntil = 0, nextGlitch = 0;

function newColumn(x, startRandom) {
  return {
    x,
    y: startRandom ? rand(-H, H) : rand(-300, -20),
    speed: rand(0.6, 1.6),
    text: pick(SNIPPETS),
    i: 0,
    corrupt: Math.random() < 0.18,   // this column glitches more
    split: Math.random() < 0.12      // RGB split column
  };
}

// Colors follow the accent picked in Settings
let C_HEAD = "#ff3b2b", C_TAIL = "#7a0a05", C_SPLIT = "rgba(255, 30, 20, .9)";
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  C_HEAD = cs.getPropertyValue("--red-2").trim() || C_HEAD;
  C_TAIL = cs.getPropertyValue("--red-deep").trim() || C_TAIL;
  C_SPLIT = C_HEAD;
}
readColors();
window.addEventListener("prefchange", () => { readColors(); });

function resizeRain() {
  const r = canvas.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  FS = W < 700 ? 13 : 16;
  const count = Math.ceil(W / (FS * 0.95));
  cols = Array.from({ length: count }, (_, n) => newColumn(n * FS * 0.95, true));
  ctx.fillStyle = "#050506";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) drawFrame(0);
}

function drawFrame(now) {
  // fade previous frame → trails
  ctx.fillStyle = "rgba(5, 5, 6, 0.07)";
  ctx.fillRect(0, 0, W, H);
  ctx.font = `600 ${FS}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textBaseline = "top";

  for (const c of cols) for (let rep = 0; rep < 2; rep++) {
    let ch = c.text[c.i % c.text.length];
    c.i++;
    if (c.i >= c.text.length && Math.random() < 0.3) { c.text = pick(SNIPPETS); c.i = 0; }
    if (Math.random() < (c.corrupt ? 0.35 : 0.06)) ch = pick(GLITCH);

    const head = Math.random() < 0.9;
    if (c.split) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(0, 255, 255, .55)"; ctx.fillText(ch, c.x - 2, c.y);
      ctx.fillStyle = C_SPLIT; ctx.fillText(ch, c.x + 2, c.y);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.fillStyle = head ? (Math.random() < 0.08 ? "#ffffff" : C_HEAD) : C_TAIL;
      ctx.fillText(ch, c.x, c.y);
    }
    c.y += FS * (rep ? 1 : c.speed);
    if (c.y > H + 40) { Object.assign(c, newColumn(c.x, false)); break; }
  }

  // occasional big glitch burst: tear horizontal slices and shift them
  const lvl = glitchLevel();
  if (lvl === "off") { glitchUntil = 0; nextGlitch = now + 2000; }
  else if (now > nextGlitch) {
    glitchUntil = now + rand(90, 260);
    if (Math.random() < 0.55) paperGlitch(rand(160, 280));
    nextGlitch = now + (lvl === "high" ? rand(700, 2200) : rand(1600, 4800));
  }
  if (now < glitchUntil) {
    const slices = (Math.random() * 5 + 2) | 0;
    for (let s = 0; s < slices; s++) {
      const sy = rand(0, H), sh = rand(4, 40), dx = rand(-60, 60);
      ctx.drawImage(canvas, 0, sy * DPR, W * DPR, sh * DPR, dx, sy, W, sh);
    }
    if (Math.random() < 0.5) {
      ctx.globalAlpha = rand(0.08, 0.25); ctx.fillStyle = C_HEAD;
      ctx.fillRect(0, rand(0, H), W, rand(2, 10));
      ctx.globalAlpha = 1;
    }
    if (Math.random() < 0.3) {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = `700 ${FS * 1.4}px "JetBrains Mono", monospace`;
      ctx.fillText(pick(["ERR_CORRUPT", "0xDEADBEEF", "SIGNAL LOST", "///█▓▒░", "FATAL::", "NULL_PTR"]), rand(0, W - 200), rand(0, H));
    }
  }
}

function loop(now) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  if (now - last < 45) return;   // ~22 fps: retro terminal feel + light on battery
  last = now;
  drawFrame(now);
}

function startRain() {
  if (running) return;
  if (reduceMotion()) { for (let i = 0; i < 80; i++) drawFrame(0); return; }
  running = true;
  rafId = requestAnimationFrame(loop);
}
function stopRain() { running = false; cancelAnimationFrame(rafId); }

/* =========================================================
   2) TORN PAPER (SVG with a ripped hole showing the code)
   ========================================================= */
const paper = document.getElementById("paper");

// small seeded random so the tear keeps the same shape on resize
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// Build a jagged torn outline around an ellipse
function tearPoints(cx, cy, rx, ry, seed, prog = 1) {
  const r = seeded(seed);
  const n = 170;
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    let m = 1 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.09 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 9 + ph[2]);
    m += (r() - 0.5) * 0.07;                 // small jagged teeth
    if (r() < 0.06) m += r() * 0.09;         // occasional paper fibre spike
    if (r() < 0.025) m -= r() * 0.08;        // little bite taken out
    pts.push([cx + Math.cos(a) * rx * m * prog, cy + Math.sin(a) * ry * m * prog]);
  }
  return pts;
}
const toPath = pts => "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + " Z";
// same outline pushed outwards a bit (the white torn layer under the dark paper)
const grow = (pts, cx, cy, f, seed) => {
  const r = seeded(seed);
  return pts.map(([x, y]) => { const k = f + (r() - 0.5) * 0.035; return [cx + (x - cx) * k, cy + (y - cy) * k]; });
};

function holeSpecs() {
  const rect = paper.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (w < 860) {
    return { w, h, mobile: true, holes: [{ cx: w * 0.58, cy: h * 0.83, rx: w * 0.55, ry: h * 0.15, seed: 7, flap: true, main: true }] };
  }
  return {
    w, h, mobile: false,
    holes: [
      { cx: w * 0.75, cy: h * 0.5, rx: w * 0.23, ry: h * 0.34, seed: 11, flap: true, main: true },
      { cx: w * 0.97, cy: h * 0.93, rx: w * 0.06, ry: h * 0.07, seed: 23, flap: false }
    ]
  };
}

// The "flap": a piece of paper folded back over the hole near its top-left
function flapPath(pts) {
  const n = pts.length;
  const i0 = Math.floor(n * 0.58), i1 = Math.floor(n * 0.72);
  const seg = pts.slice(i0, i1 + 1);
  const [ax, ay] = seg[0], [bx, by] = seg[seg.length - 1];
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  const mirrored = seg.slice().reverse().map(([px, py]) => {
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    const fx = ax + t * dx, fy = ay + t * dy;
    return [2 * fx - px, 2 * fy - py];
  });
  return toPath(seg.concat(mirrored));
}

// Cracks running out of the hole into the paper
function cracks(s) {
  const r = seeded(s.seed * 7 + 3);
  const out = [];
  const count = s.main ? 7 : 2;
  for (let c = 0; c < count; c++) {
    const i = Math.floor(r() * s.pts.length);
    let [x, y] = s.pts[i];
    let ang = Math.atan2(y - s.cy, x - s.cx) + (r() - 0.5) * 0.6;
    const steps = 5 + Math.floor(r() * 7);
    const seg = [[x, y]];
    for (let k = 0; k < steps; k++) {
      ang += (r() - 0.5) * 0.9;
      const len = 6 + r() * 16;
      x += Math.cos(ang) * len; y += Math.sin(ang) * len;
      seg.push([x, y]);
    }
    out.push("M" + seg.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L"));
  }
  return out.join(" ");
}

// Tape strips holding the rip together
function tapes(s, mobile) {
  if (!s.main) return "";
  const n = s.pts.length;
  return (mobile ? [0.64, 0.88] : [0.07, 0.36, 0.83]).map((f, k) => {
    const i = Math.floor(n * f);
    const [x, y] = s.pts[i];
    const [x2, y2] = s.pts[(i + 3) % n];
    const ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI + 90 + (k - 1) * 14;
    const L = mobile ? 74 : 128, T = mobile ? 22 : 36;
    const zig = side => Array.from({ length: 6 }, (_, j) => `${side * (L / 2 + (j % 2 ? 4 : 0))} ${-T / 2 + (T / 5) * j}`).join(" L");
    return `<g class="tape" style="--td:${0.9 + k * 0.18}s" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})">
      <path d="M${zig(-1)} L${zig(1).split(" L").reverse().join(" L")} Z" fill="url(#tapeGrad)"/>
      <path d="M${-L / 2} ${-T / 2 + 3} H${L / 2}" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    </g>`;
  }).join("");
}

// Little scraps of paper floating around the hole
function shreds(s, w) {
  if (!s.main) return "";
  const r = seeded(99);
  return Array.from({ length: 7 }, (_, k) => {
    const i = Math.floor(r() * s.pts.length);
    const [px, py] = s.pts[i];
    const out = 0.9 + r() * 0.25;
    const x = s.cx + (px - s.cx) * out, y = s.cy + (py - s.cy) * out;
    const size = 3 + r() * 8;
    const pts = Array.from({ length: 11 }, (_, j) => { const a = j / 11 * 6.28 + r() * 0.3; const m = size * (0.45 + r() * 0.7) * (j % 2 ? 1 : 0.8); return [Math.cos(a) * m * 1.5, Math.sin(a) * m]; });
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path class="shred" style="--sd:${(r() * 4).toFixed(2)}s;--sr:${(r() * 60 - 30).toFixed(0)}deg" d="${toPath(pts)}" fill="${k % 3 ? "#d9cebb" : "#2a2524"}" opacity=".9"/></g>`;
  }).join("");
}

let built = false, openProg = 0, specCache = null;
function buildPaper(prog = 1) {
  const spec = holeSpecs();
  specCache = spec;
  const { w, h, holes, mobile } = spec;
  paper.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const shapes = holes.map(hs => ({ ...hs, pts: tearPoints(hs.cx, hs.cy, hs.rx, hs.ry, hs.seed, prog) }));
  const holeD = shapes.map(s => toPath(s.pts)).join(" ");
  const underD = shapes.map(s => toPath(grow(s.pts, s.cx, s.cy, 1.035, s.seed + 1))).join(" ");

  if (!built) {
    paper.innerHTML = `
      <defs>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .09  0 0 0 0 .07  0 0 0 0 .07  0 0 0 .55 0"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <filter id="fibers" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="9" result="t"/>
          <feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id="fibers2" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="2" seed="2" result="t"/>
          <feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="glowBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
        <radialGradient id="paperShade" cx="25%" cy="40%" r="90%">
          <stop offset="0" stop-color="#161414"/><stop offset=".6" stop-color="#0d0c0c"/><stop offset="1" stop-color="#060606"/>
        </radialGradient>
        <linearGradient id="flapGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3a3431"/><stop offset=".45" stop-color="#1d1a19"/><stop offset="1" stop-color="#0c0b0b"/>
        </linearGradient>
        <linearGradient id="tapeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#efe6d4" stop-opacity=".34"/><stop offset=".5" stop-color="#d9cdb6" stop-opacity=".22"/><stop offset="1" stop-color="#efe6d4" stop-opacity=".3"/>
        </linearGradient>
        <mask id="tearMask" maskUnits="userSpaceOnUse">
          <rect id="mask-rect" fill="#fff"/>
          <path id="mask-hole" fill="#000"/>
        </mask>
        <mask id="underMask" maskUnits="userSpaceOnUse">
          <rect id="mask-rect2" fill="#fff"/>
          <path id="mask-hole2" fill="#000"/>
        </mask>
        <clipPath id="holeClip"><path id="clip-hole"/></clipPath>
        <clipPath id="sl0"><rect id="sl0r" x="0"/></clipPath>
        <clipPath id="sl1"><rect id="sl1r" x="0"/></clipPath>
        <clipPath id="sl2"><rect id="sl2r" x="0"/></clipPath>
      </defs>
      <g id="pl">
        <!-- white torn layer that shows around the edge -->
        <g mask="url(#tearMask)">
          <path id="paper-under" fill="#d8cdb9" filter="url(#fibers2)"/>
        </g>
        <g mask="url(#underMask)">
          <rect id="paper-base" fill="url(#paperShade)"/>
          <rect id="paper-grain" fill="#fff" filter="url(#grain)"/>
          <path id="paper-cracks" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>
          <path id="paper-cracks-hi" fill="none" stroke="#e8e0d2" stroke-width=".8" stroke-linecap="round" opacity=".18" transform="translate(1.2 1.2)"/>
        </g>
        <g mask="url(#tearMask)" class="rims">
          <path id="rim-c" class="rim-c" transform="translate(2 0)" fill="none" stroke="#19e6ff" stroke-width="3" opacity=".22"/>
          <path id="rim-r" class="rim-r" transform="translate(-2 0)" fill="none" stroke="#ff1a0a" stroke-width="3" opacity=".5"/>
          <path id="paper-rim" fill="none" stroke="#f1e9db" stroke-width="5" filter="url(#fibers)" opacity=".95"/>
        </g>
        <g clip-path="url(#holeClip)">
          <path id="hole-shadow" fill="none" stroke="#000" stroke-width="56" filter="url(#soft)" opacity=".95"/>
          <path id="hole-glow" class="hole-glow" fill="none" stroke="#ff2b1c" stroke-width="34" filter="url(#glowBlur)"/>
        </g>
        <g id="flaps"></g>
        <g id="tapes"></g>
        <g id="shreds"></g>
        <g id="stamp" class="stamp" aria-hidden="true"></g>
      </g>
      <g id="slices" class="slices">
        <use href="#pl" clip-path="url(#sl0)" id="sl0u"/>
        <use href="#pl" clip-path="url(#sl1)" id="sl1u"/>
        <use href="#pl" clip-path="url(#sl2)" id="sl2u"/>
      </g>`;
    built = true;
  }
  const q = id => paper.querySelector("#" + id);
  ["mask-rect", "mask-rect2", "paper-base", "paper-grain"].forEach(id => { q(id).setAttribute("width", w); q(id).setAttribute("height", h); });
  ["mask-hole", "clip-hole", "paper-rim", "hole-shadow", "hole-glow", "rim-r", "rim-c"].forEach(id => q(id).setAttribute("d", holeD));
  q("paper-under").setAttribute("d", underD);
  q("mask-hole2").setAttribute("d", underD);
  ["sl0r", "sl1r", "sl2r"].forEach(id => q(id).setAttribute("width", w));

  const done = prog > 0.98;
  const crackD = done ? shapes.map(cracks).join(" ") : "";
  q("paper-cracks").setAttribute("d", crackD);
  q("paper-cracks-hi").setAttribute("d", crackD);

  // folded flaps (only once the tear is mostly open)
  q("flaps").innerHTML = prog > 0.6 ? shapes.filter(s => s.flap).map(s => {
    const d = flapPath(s.pts);
    return `<path d="${d}" fill="url(#flapGrad)" opacity="${Math.min(1, (prog - 0.6) * 2.5)}"/>
            <path d="${d}" fill="url(#grain)" opacity=".5"/>
            <path d="${d}" fill="none" stroke="#efe6d6" stroke-width="2.4" filter="url(#fibers)" opacity=".75"/>`;
  }).join("") : "";
  q("tapes").innerHTML = done ? shapes.map(s => tapes(s, mobile)).join("") : "";
  q("shreds").innerHTML = done ? shapes.map(s => shreds(s, w)).join("") : "";

  // red "corrupted" stamp on the paper next to the rip
  const stamp = q("stamp");
  if (done && !mobile) {
    const sx = w * 0.552, sy = h * 0.165;
    stamp.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(-8)`);
    stamp.innerHTML = `
      <rect x="-96" y="-27" width="192" height="54" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>
      <rect x="-89" y="-20" width="178" height="40" rx="2" fill="none" stroke="currentColor" stroke-width="1"/>
      <text x="0" y="-1" text-anchor="middle" class="stamp-big">${esc(t("home.stamp"))}</text>
      <text x="0" y="13" text-anchor="middle" class="stamp-small">0xDEAD · ${new Date().getFullYear()}</text>`;
    stamp.style.display = "";
  } else {
    stamp.innerHTML = "";
    stamp.style.display = "none";
  }
}

// Glitch burst on the paper: chunks of the rip slide sideways, colour edges split
let paperBusy = false;
function paperGlitch(dur = 220) {
  if (!built || paperBusy || reduceMotion() || glitchLevel() === "off" || !specCache) return;
  paperBusy = true;
  const { h } = specCache;
  const big = glitchLevel() === "high" ? 1.6 : 1;
  const slices = paper.querySelector("#slices");
  const rr = paper.querySelector("#rim-r"), rc = paper.querySelector("#rim-c");
  paper.classList.add("p-glitch");
  let steps = 0;
  const tick = () => {
    ["sl0", "sl1", "sl2"].forEach(id => {
      const r = paper.querySelector(`#${id}r`);
      r.setAttribute("y", rand(0, h).toFixed(0));
      r.setAttribute("height", rand(6, 46).toFixed(0));
      paper.querySelector(`#${id}u`).setAttribute("transform", `translate(${(rand(-34, 34) * big).toFixed(1)} 0)`);
    });
    rr.setAttribute("transform", `translate(${(rand(-9, -3) * big).toFixed(1)} ${rand(-2, 2).toFixed(1)})`);
    rc.setAttribute("transform", `translate(${(rand(3, 9) * big).toFixed(1)} ${rand(-2, 2).toFixed(1)})`);
    slices.style.display = "block";
    if (++steps < 3) setTimeout(tick, dur / 3);
    else setTimeout(() => {
      slices.style.display = "none";
      rr.setAttribute("transform", "translate(-2 0)");
      rc.setAttribute("transform", "translate(2 0)");
      paper.classList.remove("p-glitch");
      paperBusy = false;
    }, dur / 3);
  };
  tick();
}

// rip-open animation
function ripOpen() {
  if (reduceMotion()) { buildPaper(1); return; }
  const start = performance.now(), dur = 1100;
  const ease = x => 1 - Math.pow(1 - x, 4);
  const step = now => {
    const p = Math.min(1, (now - start) / dur);
    // small jolts while tearing
    openProg = ease(p) * (1 + (p < 1 ? Math.sin(p * 40) * 0.015 : 0));
    buildPaper(p >= 1 ? 1 : Math.max(0.001, Math.min(0.97, openProg)));
    if (p < 1) requestAnimationFrame(step);
    else setTimeout(() => paperGlitch(260), 120);
  };
  setTimeout(() => requestAnimationFrame(step), 250);
}

/* =========================================================
   3) Page content: services, packages, featured, marquee
   ========================================================= */
function renderPackages() {
  const grid = document.getElementById("packages-grid");
  const wasIn = grid.dataset.rendered === "1";
  grid.innerHTML = SITE.packages.map((p, i) => {
    const features = t(`pkg.${p.id}.features`);
    return `
    <article class="card spot pkg${p.popular ? " popular" : ""} reveal${wasIn ? " in" : ""}" style="--d:${i * 110}ms">
      ${p.popular ? `<span class="pkg-badge">${esc(t("pkg.popular"))}</span>` : ""}
      <h3>${esc(t(`pkg.${p.id}.name`))}</h3>
      <p class="muted">${esc(t(`pkg.${p.id}.desc`))}</p>
      <div class="pkg-price"><small>${esc(t("pkg.from"))}</small><strong>${esc(money(p.price))}</strong><small>${esc(SITE.currency)}</small></div>
      <ul>${(Array.isArray(features) ? features : []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      <a class="btn ${p.popular ? "btn-red" : "btn-ghost"} btn-block" href="book.html?package=${encodeURIComponent(p.id)}">${esc(t("pkg.choose"))} <span class="arrow">→</span></a>
    </article>`;
  }).join("");
  grid.dataset.rendered = "1";
}

function renderMarquee() {
  const items = [1, 2, 3, 4, 5, 6, 7].map(n => `<span>${esc(t(`marq.${n}`))}</span>`).join("");
  document.getElementById("marquee-track").innerHTML = items + items + items + items;
  const rev = [7, 6, 5, 4, 3, 2, 1].map(n => `<span>${esc(t(`marq.${n}`))}</span>`).join("");
  document.getElementById("marquee-track-2").innerHTML = rev + rev + rev + rev;
}

let featured = [];
function renderFeatured() {
  const sec = document.getElementById("featured");
  const grid = document.getElementById("featured-grid");
  const list = featured.filter(l => l.status === "available").slice(0, 3);
  const show = list.length ? list : featured.slice(0, 3);
  sec.hidden = !show.length;
  if (!show.length) return;
  grid.innerHTML = show.map(cardHTML).join("");
  grid.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  wireCards(grid, show);
}
async function loadFeatured() {
  try { featured = await fetchPublicListings(); } catch (e) { console.warn(e); featured = []; }
  renderFeatured();
}

/* =========================================================
   4) Small effects: glitchy title, number counters
   ========================================================= */
const title = document.getElementById("hero-title");
function syncGlitchText() { title.setAttribute("data-text", title.textContent); }
function glitchLoop() {
  if (reduceMotion()) return;
  title.classList.remove("glitching"); void title.offsetWidth; title.classList.add("glitching");
  setTimeout(glitchLoop, rand(2600, 5200));
}

function counters() {
  const els = document.querySelectorAll("[data-count]");
  const run = el => {
    const end = +el.dataset.count;
    if (reduceMotion()) { el.textContent = end; return; }
    const start = performance.now(), dur = 1600;
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  setTimeout(() => els.forEach(run), 900);
}

/* =========================================================
   Start
   ========================================================= */
resizeRain();
buildPaper(0.001);
ripOpen();
renderPackages();
renderMarquee();
syncGlitchText();
setTimeout(glitchLoop, 1800);
counters();
loadFeatured();

// Only animate the code while the hero is on screen
new IntersectionObserver(([e]) => (e.isIntersecting ? startRain() : stopRain()), { threshold: 0 }).observe(document.getElementById("hero"));
document.addEventListener("visibilitychange", () => (document.hidden ? stopRain() : startRain()));

// Paper and text drift apart a little while scrolling (depth effect)
const heroEl = document.getElementById("hero");
const heroCopy = heroEl.querySelector(".hero-inner");
let pRaf = 0, scrollY0 = 0, mx = 0, my = 0, tmx = 0, tmy = 0, mRaf = 0;
function applyDepth() {
  paper.style.transform = `translate3d(${(mx * 10).toFixed(2)}px, ${(scrollY0 * 0.18 + my * 8).toFixed(2)}px, 0)`;
  canvas.style.transform = `translate3d(${(-mx * 16).toFixed(2)}px, ${(-my * 12).toFixed(2)}px, 0) scale(1.04)`;
}
// Mouse moves the paper and the code behind it in opposite directions (depth)
if (matchMedia("(pointer: fine)").matches) {
  heroEl.addEventListener("pointermove", e => {
    if (reduceMotion()) return;
    const r = heroEl.getBoundingClientRect();
    tmx = (e.clientX - r.left) / r.width - 0.5;
    tmy = (e.clientY - r.top) / r.height - 0.5;
    if (!mRaf) mRaf = requestAnimationFrame(function ease() {
      mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
      applyDepth();
      mRaf = Math.abs(tmx - mx) + Math.abs(tmy - my) > 0.002 ? requestAnimationFrame(ease) : 0;
    });
  });
  heroEl.addEventListener("pointerleave", () => { tmx = 0; tmy = 0; heroEl.dispatchEvent(new PointerEvent("pointermove", { clientX: heroEl.getBoundingClientRect().left + heroEl.clientWidth / 2, clientY: heroEl.getBoundingClientRect().top + heroEl.clientHeight / 2 })); });
}
window.addEventListener("scroll", () => {
  if (pRaf || reduceMotion()) return;
  pRaf = requestAnimationFrame(() => {
    pRaf = 0;
    const y = Math.min(window.scrollY, innerHeight);
    scrollY0 = y;
    applyDepth();
    heroCopy.style.transform = `translate3d(0, ${y * 0.32}px, 0)`;
    heroCopy.style.opacity = String(Math.max(0, 1 - y / (innerHeight * 0.8)));
  });
}, { passive: true });

let rT;
window.addEventListener("resize", () => {
  clearTimeout(rT);
  rT = setTimeout(() => { resizeRain(); buildPaper(1); }, 150);
});

window.addEventListener("langchange", () => {
  renderPackages(); renderMarquee(); syncGlitchText(); renderFeatured(); buildPaper(1);
});

/* =========================================================
   5) Hero terminal: types a fake deploy log
   ========================================================= */
const TERM_LINES = [
  ["$ ", "npm run build"],
  ["✓ ", "design ........ 100%"],
  ["✓ ", "mobile ........ 100%"],
  ["✓ ", "seo ........... 98"],
  ["✓ ", "speed ......... 0.8s"],
  ["→ ", "deploy: LIVE ●"]
];
async function typeTerminal() {
  const box = document.getElementById("hero-term");
  if (!box) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  while (true) {
    box.innerHTML = "";
    for (const [pre, txt] of TERM_LINES) {
      const line = document.createElement("div");
      line.innerHTML = `<span class="p">${esc(pre)}</span><span class="t"></span>`;
      box.appendChild(line);
      const el = line.querySelector(".t");
      if (reduceMotion()) { el.textContent = txt; continue; }
      for (let i = 1; i <= txt.length; i++) { el.textContent = txt.slice(0, i); await sleep(pre === "$ " ? 55 : 18); }
      await sleep(260);
    }
    await sleep(4200);
  }
}

/* =========================================================
   6) Manifesto: each word lights up as you scroll through it
   ========================================================= */
let mWords = [];
function renderManifesto() {
  const el = document.getElementById("manifesto-text");
  const raw = t("home.manifesto");
  el.setAttribute("aria-label", raw.replace(/[\[\]]/g, ""));
  el.innerHTML = raw.split(/\s+/).map(w => {
    const hl = /^\[.*\]/.test(w);
    const clean = w.replace(/[\[\]]/g, "");
    return `<span class="mw${hl ? " hl" : ""}" aria-hidden="true">${esc(clean)}</span>`;
  }).join(" ");
  mWords = [...el.querySelectorAll(".mw")];
  updateManifesto();
}
function updateManifesto() {
  const sec = document.getElementById("manifesto");
  if (!sec || !mWords.length) return;
  const r = sec.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height * 0.9)));
  const lit = reduceMotion() ? mWords.length : Math.round(p * mWords.length * 1.1);
  mWords.forEach((w, i) => w.classList.toggle("on", i < lit));
}

/* =========================================================
   7) Process timeline: red line fills while scrolling
   ========================================================= */
const tl = document.getElementById("timeline");
const tlFill = document.getElementById("tl-fill");
const tlSteps = [...document.querySelectorAll(".tl-step")];
function updateTimeline() {
  if (!tl) return;
  const r = tl.getBoundingClientRect();
  const p = reduceMotion() ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / (r.height + innerHeight * 0.25)));
  tlFill.style.transform = window.innerWidth > 860 ? `scaleX(${p})` : `scaleY(${p})`;
  tlSteps.forEach((s, i) => s.classList.toggle("lit", p >= i / tlSteps.length + 0.02));
}

/* =========================================================
   8) Bento tiles: small live animations
   ========================================================= */
function bentoLife() {
  const cart = document.getElementById("cart-count");
  const sales = document.getElementById("sales-num");
  const plus = document.querySelector(".plus1");
  let n = 3, total = 12480;
  setInterval(() => {
    if (document.hidden || reduceMotion()) return;
    n = n >= 9 ? 1 : n + 1;
    total += 180 + Math.round(Math.random() * 900);
    cart.textContent = n;
    sales.textContent = new Intl.NumberFormat(locale()).format(total);
    plus.classList.remove("go"); void plus.offsetWidth; plus.classList.add("go");
    glitchEl(cart, 300);
  }, 2400);

  const cal = document.getElementById("mini-cal");
  cal.innerHTML = Array.from({ length: 21 }, () => "<i></i>").join("");
  const cells = [...cal.children];
  setInterval(() => {
    if (document.hidden || reduceMotion()) return;
    cells.forEach(c => c.classList.remove("on"));
    for (let k = 0; k < 4; k++) cells[(Math.random() * cells.length) | 0].classList.add("on");
    document.querySelectorAll(".art-apps .tg").forEach(tg => { if (Math.random() < .5) tg.classList.toggle("on"); });
  }, 1600);
}

/* =========================================================
   9) Big CTA word glitches when it comes into view
   ========================================================= */
const mega = document.getElementById("mega-word");
function syncMega() { mega.setAttribute("data-text", mega.textContent); }
new IntersectionObserver(([e]) => {
  if (e.isIntersecting) { mega.classList.add("in"); setTimeout(() => glitchEl(mega, 500), 700); }
}, { threshold: .4 }).observe(mega);

let sRaf = 0;
window.addEventListener("scroll", () => {
  if (sRaf) return;
  sRaf = requestAnimationFrame(() => { sRaf = 0; updateManifesto(); updateTimeline(); });
}, { passive: true });
window.addEventListener("resize", () => { updateManifesto(); updateTimeline(); });

renderManifesto();
updateTimeline();
syncMega();
bentoLife();
typeTerminal();
window.addEventListener("langchange", () => { renderManifesto(); syncMega(); });

/* =========================================================
   8) BEFORE / AFTER slider with a glitchy seam
   ========================================================= */
(() => {
  const ba = document.getElementById("ba");
  const range = document.getElementById("ba-range");
  if (!ba || !range) return;
  const set = v => { ba.style.setProperty("--pos", v + "%"); range.value = v; };
  let touched = false, raf = 0;
  range.addEventListener("input", () => { touched = true; cancelAnimationFrame(raf); set(+range.value); ba.classList.add("dragging"); });
  range.addEventListener("change", () => ba.classList.remove("dragging"));
  range.addEventListener("pointerup", () => ba.classList.remove("dragging"));
  // first time it shows up: sweep the seam across so people get it
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    if (reduceMotion() || touched) return;
    const start = performance.now(), dur = 2400;
    const step = now => {
      if (touched) return;
      const p = Math.min(1, (now - start) / dur);
      set((50 + Math.sin(p * Math.PI * 2) * 32 * (1 - p * 0.4)).toFixed(1));
      if (p < 1) raf = requestAnimationFrame(step); else set(50);
    };
    raf = requestAnimationFrame(step);
  }, { threshold: 0.5 }).observe(ba);
  // random glitch on the seam
  const seam = ba.querySelector(".ba-seam");
  (function loop() {
    if (!reduceMotion() && glitchLevel() !== "off") glitchEl(seam, 260);
    setTimeout(loop, glitchLevel() === "high" ? rand(1400, 2600) : rand(2800, 5200));
  })();
})();

/* =========================================================
   9) DEVICES: a sample site that scrolls inside the screens
   ========================================================= */
function renderMocks() {
  document.querySelectorAll("[data-mock]").forEach(m => {
    m.innerHTML = `
      <div class="ms-nav"><i class="ms-logo"></i><span></span><span></span><span></span><b>${esc(t("home.dev.mockBtn"))}</b></div>
      <div class="ms-hero"><strong>${esc(t("home.dev.mockTitle"))}</strong><span class="ms-line"></span><span class="ms-line short"></span><b class="ms-btn">${esc(t("home.dev.mockBtn"))} →</b></div>
      <div class="ms-strip"><i></i><i></i><i></i><i></i></div>
      <div class="ms-cards">${[1, 2, 3, 4, 5, 6].map(i => `<div class="ms-card"><span class="ms-ph p${i % 3}"></span><span class="ms-line"></span><span class="ms-price">$${(i * 349 + 99).toLocaleString(locale())}</span></div>`).join("")}</div>
      <div class="ms-band"><strong>${esc(t("home.ba.newTag"))}</strong><span class="ms-line"></span></div>
      <div class="ms-cards">${[7, 8, 9].map(i => `<div class="ms-card"><span class="ms-ph p${i % 3}"></span><span class="ms-line"></span><span class="ms-price">$${(i * 349 + 99).toLocaleString(locale())}</span></div>`).join("")}</div>
      <div class="ms-foot"><i></i><span class="ms-line short"></span></div>`;
  });
}
// how far each sample page should scroll inside its screen
function measureMocks() {
  document.querySelectorAll("[data-mock]").forEach(m => m.style.setProperty("--dist", Math.max(0, m.offsetHeight - m.parentElement.clientHeight) + "px"));
}
renderMocks();
requestAnimationFrame(measureMocks);
document.fonts?.ready.then(measureMocks);
window.addEventListener("resize", () => requestAnimationFrame(measureMocks));

/* =========================================================
   10) What every website includes
   ========================================================= */
const INC_ICONS = ["M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z", "M7 2h10v20H7zM11 18h2", "M4 4h16v16H4zM4 4l8 8 8-8",
  "M3 21l1.6-4.8A8.5 8.5 0 1 1 7.8 19.4z", "M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5", "M3 6h18v5H3zM3 13h18v5H3zM7 8.5h.01M7 15.5h.01", "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20"];
function renderIncluded() {
  const grid = document.getElementById("inc-grid");
  if (!grid) return;
  const wasIn = grid.dataset.rendered === "1";
  grid.innerHTML = INC_ICONS.map((d, i) => `
    <li class="inc reveal${wasIn ? " in" : ""}" style="--d:${(i % 5) * 70}ms">
      <span class="inc-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>
      <span class="inc-txt" data-text="${esc(t(`home.inc.${i + 1}`))}">${esc(t(`home.inc.${i + 1}`))}</span>
      <span class="inc-ok" aria-hidden="true">✓</span>
    </li>`).join("");
  grid.dataset.rendered = "1";
}
renderIncluded();
{
  const g = document.getElementById("inc-grid");
  g?.addEventListener("pointerover", e => { const li = e.target.closest(".inc"); if (li && !li.classList.contains("gx-run")) glitchEl(li, 220); });
}
window.addEventListener("langchange", () => { renderMocks(); measureMocks(); renderIncluded(); });
