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
   2) RIPPED POSTER: the paper is torn down the middle, the
      right part falls away and the corrupted code shows behind.
   ========================================================= */
const paper = document.getElementById("paper");

// small seeded random so the tear keeps the same shape on resize
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const f1 = n => n.toFixed(1);
const toPath = pts => "M" + pts.map(p => f1(p[0]) + " " + f1(p[1])).join(" L") + " Z";
const toLine = pts => "M" + pts.map(p => f1(p[0]) + " " + f1(p[1])).join(" L");

// A jagged torn line in "local" coordinates: v runs along the tear, u across it
function tearLine(u0, u1, L, amp, seed, n = 120) {
  const r = seeded(seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, v = -12 + (L + 24) * t;
    let u = u0 + (u1 - u0) * t
      + amp * (Math.sin(t * 6.3 + ph[0]) * 0.55 + Math.sin(t * 17 + ph[1]) * 0.28 + Math.sin(t * 41 + ph[2]) * 0.12);
    u += (r() - 0.5) * amp * 0.22;                  // small jagged teeth
    if (r() < 0.07) u += (r() - 0.3) * amp * 0.7;   // fibre spikes / bites
    pts.push([u, v]);
  }
  return pts;
}
// reflect a point across the line a→b
function reflect([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = ((px - ax) * dx + (py - ay) * dy) / l2;
  const fx = ax + t * dx, fy = ay + t * dy;
  return [2 * fx - px, 2 * fy - py];
}

let built = false, specCache = null, introDone = false, builtSize = "";
// redraw the paper whenever the hero changes size (fonts loading, rotating the phone…)
if ("ResizeObserver" in window) {
  let roT;
  new ResizeObserver(() => {
    const r = paper.getBoundingClientRect();
    if (Math.round(r.width) + "x" + Math.round(r.height) === builtSize) return;
    clearTimeout(roT); roT = setTimeout(() => buildPaper(), 60);
  }).observe(paper);
}
function buildPaper() {
  const rect = paper.getBoundingClientRect();
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if (!w || !h) { requestAnimationFrame(() => buildPaper()); return; }
  const mobile = w < 860;
  // local → screen. Desktop: tear runs top→bottom. Phone: tear runs left→right near the bottom.
  const P = mobile ? ([u, v]) => [v, u] : ([u, v]) => [u, v];
  const C = mobile ? h : w, L = mobile ? w : h;
  specCache = { w, h, mobile };

  const tearL = mobile
    ? tearLine(h * 0.73, h * 0.79, L, h * 0.04, 5)
    : tearLine(w * 0.635, w * 0.695, L, w * 0.03, 11);
  const n = tearL.length - 1;

  // folded corner at the top of the tear (desktop)
  const kB = mobile ? 0 : Math.round(n * 0.27);
  const A = mobile ? null : [tearL[0][0] - w * 0.1, -12];
  const B = tearL[kB];
  const edge = tearL.slice(kB);                                   // the visible torn edge
  const keepLocal = mobile
    ? [[-12, -12], ...tearL, [-12, L + 12]]
    : [[-12, -12], A, ...edge, [-12, L + 12]];
  const keep = keepLocal.map(P);

  // white fibrous layer peeking out along the torn edge
  const rr = seeded(77);
  const under = [[-12, -12], ...(mobile ? [] : [A]), ...edge.map(([u, v]) => [u + 4 + rr() * 11, v]), [-12, L + 12]].map(P);

  // the part that falls away when the page opens
  const fall = [...tearL, [C + 12, L + 12], [C + 12, -12]].map(P);

  // peeled flap
  let flapD = "", flapShadowD = "", flapEdgeD = "";
  if (!mobile) {
    const region = tearL.slice(0, kB + 1);
    const flap = [A, ...region.map(p => reflect(p, A, B))];
    flapD = toPath(flap);
    flapShadowD = toPath(flap.map(([x, y]) => [x - 6, y + 12]));
    flapEdgeD = toLine(region.map(p => reflect(p, A, B)));
  }

  // torn strip still hanging on the right (desktop)
  let stripD = "", stripUnderD = "", stripEdge = [];
  if (!mobile) {
    const s = tearLine(w * 0.885, w * 1.02, h * 0.62, w * 0.012, 31, 50).map(([u, v]) => [u + Math.pow(Math.max(0, v) / (h * 0.62), 2.2) * w * 0.12, v]);
    stripEdge = s.filter(p => p[0] < w + 12);
    stripD = toPath([[w + 12, -12], ...stripEdge.slice().reverse()]);
    const r2 = seeded(9);
    stripUnderD = toPath([[w + 12, -12], ...stripEdge.slice().reverse().map(([x, y]) => [x - 4 - r2() * 9, y])]);
  }

  // cracks running from the edge into the paper
  const rc = seeded(3);
  const cracks = [];
  for (let c = 0; c < (mobile ? 4 : 8); c++) {
    let [u, v] = edge[Math.floor(rc() * edge.length)];
    let ang = Math.PI + (rc() - 0.5) * 1.1;
    const seg = [[u, v]];
    for (let k = 0, steps = 4 + Math.floor(rc() * 7); k < steps; k++) {
      ang += (rc() - 0.5) * 0.9;
      const len = 6 + rc() * 15;
      u += Math.cos(ang) * len; v += Math.sin(ang) * len;
      seg.push([u, v]);
    }
    cracks.push(toLine(seg.map(P)));
  }
  const crackD = cracks.join(" ");

  // tape: half on the paper, half hanging over the gap where it got ripped
  const tapes = (mobile ? [0.72] : [0.5, 0.82]).map((f, k) => {
    const i = Math.floor(edge.length * f);
    const [x, y] = P(edge[i]);
    const ang = (mobile ? 90 : 0) + (k ? -12 : 9);
    const Lt = mobile ? 70 : 118, T = mobile ? 22 : 34;
    return `<g class="tape" style="--td:${1.5 + k * 0.2}s" transform="translate(${f1(x)} ${f1(y)}) rotate(${ang})">
      <path d="M${-Lt * 0.55} ${-T / 2} L${Lt * 0.18} ${-T / 2} L${Lt * 0.24} ${-T / 4} L${Lt * 0.16} 0 L${Lt * 0.26} ${T / 4} L${Lt * 0.2} ${T / 2} L${-Lt * 0.55} ${T / 2} L${-Lt * 0.5} ${T / 4} L${-Lt * 0.56} 0 L${-Lt * 0.5} ${-T / 4} Z" fill="url(#tapeGrad)"/>
      <path d="M${Lt * 0.3} ${-T / 2} L${Lt * 0.62} ${-T / 2 + 4} L${Lt * 0.58} ${T / 2 - 2} L${Lt * 0.34} ${T / 2} L${Lt * 0.28} 0 Z" fill="url(#tapeGrad)" opacity=".75" transform="rotate(${k ? 14 : -10} ${Lt * 0.28} 0)"/>
    </g>`;
  }).join("") + (mobile ? "" : `<g class="tape" style="--td:1.9s" transform="translate(${f1(w * 0.955)} ${f1(h * 0.035)}) rotate(6)"><rect x="-58" y="-17" width="116" height="34" fill="url(#tapeGrad)"/></g>`);

  // little scraps of paper floating in the gap
  const rs = seeded(99);
  const shreds = Array.from({ length: mobile ? 5 : 9 }, (_, k) => {
    const [eu, ev] = edge[Math.floor(rs() * edge.length)];
    const [x, y] = P([eu + 14 + rs() * (mobile ? 40 : w * 0.16), ev]);
    const size = 3 + rs() * 8;
    const pts = Array.from({ length: 9 }, (_, j) => { const a = j / 9 * 6.28 + rs() * 0.4; const m = size * (0.45 + rs() * 0.7); return [Math.cos(a) * m * 1.4, Math.sin(a) * m]; });
    return `<g transform="translate(${f1(x)} ${f1(y)})"><path class="shred" style="--sd:${(rs() * 4).toFixed(2)}s;--sr:${(rs() * 60 - 30).toFixed(0)}deg" d="${toPath(pts)}" fill="${k % 3 ? "#ded3c0" : "#2a2524"}" opacity=".9"/></g>`;
  }).join("");

  const edgeLine = toLine(edge.map(P));
  const stripLine = stripEdge.length ? toLine(stripEdge) : "";
  const stamp = mobile ? "" : `
    <g class="stamp" transform="translate(${f1(w * 0.555)} ${f1(h * 0.8)}) rotate(-8)">
      <rect x="-96" y="-27" width="192" height="54" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>
      <rect x="-89" y="-20" width="178" height="40" rx="2" fill="none" stroke="currentColor" stroke-width="1"/>
      <text x="0" y="-1" text-anchor="middle" class="stamp-big">${esc(t("home.stamp"))}</text>
      <text x="0" y="13" text-anchor="middle" class="stamp-small">0xDEAD · ${new Date().getFullYear()}</text>
    </g>`;

  paper.setAttribute("viewBox", `0 0 ${w} ${h}`);
  paper.setAttribute("preserveAspectRatio", "xMidYMid slice"); // always cover the whole hero
  paper.innerHTML = `
    <defs>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 .09  0 0 0 0 .07  0 0 0 0 .07  0 0 0 .55 0"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
      <filter id="fibers" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="2" seed="2" result="t"/>
        <feDisplacementMap in="SourceGraphic" in2="t" scale="8" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
      <filter id="glowBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
      <radialGradient id="paperShade" cx="25%" cy="40%" r="90%">
        <stop offset="0" stop-color="#171515"/><stop offset=".6" stop-color="#0e0d0d"/><stop offset="1" stop-color="#070707"/>
      </radialGradient>
      <linearGradient id="flapGrad" gradientUnits="userSpaceOnUse" x1="${f1(A ? A[0] : 0)}" y1="${f1(A ? A[1] : 0)}" x2="${f1(A ? A[0] - w * 0.08 : 0)}" y2="${f1(B ? B[1] * 0.6 : 0)}">
        <stop offset="0" stop-color="#8f877b"/><stop offset=".35" stop-color="#d9cfbe"/><stop offset=".8" stop-color="#b6ab99"/><stop offset="1" stop-color="#857c70"/>
      </linearGradient>
      <linearGradient id="tapeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#efe6d4" stop-opacity=".42"/><stop offset=".5" stop-color="#d9cdb6" stop-opacity=".26"/><stop offset="1" stop-color="#efe6d4" stop-opacity=".36"/>
      </linearGradient>
      <clipPath id="keepClip"><path d="${toPath(keep)}"/></clipPath>
      <clipPath id="sl0"><rect id="sl0r" x="0" width="${w}"/></clipPath>
      <clipPath id="sl1"><rect id="sl1r" x="0" width="${w}"/></clipPath>
      <clipPath id="sl2"><rect id="sl2r" x="0" width="${w}"/></clipPath>
    </defs>
    <g id="pl">
      <!-- red light coming through the gap -->
      <path class="gap-glow" d="${edgeLine}${stripLine ? " " + stripLine : ""}" fill="none" stroke="#ff2b1c" stroke-width="70" filter="url(#glowBlur)"/>
      <!-- the piece that falls when the page opens -->
      <g class="fall${introDone ? " gone" : ""}"><path d="${toPath(fall)}" fill="url(#paperShade)"/><path d="${toPath(fall)}" fill="#fff" filter="url(#grain)"/></g>
      <!-- right strip -->
      ${stripD ? `<g class="strip"><path d="${stripUnderD}" fill="#d8cdb9" filter="url(#fibers)"/><path d="${stripD}" fill="url(#paperShade)"/><path d="${stripD}" fill="#fff" filter="url(#grain)"/></g>` : ""}
      <!-- main paper -->
      <path d="${toPath(under)}" fill="#d8cdb9" filter="url(#fibers)"/>
      <path d="${toPath(keep)}" fill="url(#paperShade)"/>
      <g clip-path="url(#keepClip)">
        <rect width="${w}" height="${h}" fill="#fff" filter="url(#grain)"/>
        <path class="cracks" d="${crackD}" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>
        <path class="cracks" d="${crackD}" fill="none" stroke="#e8e0d2" stroke-width=".8" opacity=".16" transform="translate(1.2 1.2)"/>
        <path d="${edgeLine}" fill="none" stroke="#000" stroke-width="40" filter="url(#soft)" opacity=".55" transform="translate(${mobile ? "0 -8" : "-10 0"})"/>
      </g>
      <g class="rims">
        <path id="rim-c" class="rim-c" d="${edgeLine}${stripLine ? " " + stripLine : ""}" transform="translate(2 0)" fill="none" stroke="#19e6ff" stroke-width="2.5" opacity=".25"/>
        <path id="rim-r" class="rim-r" d="${edgeLine}${stripLine ? " " + stripLine : ""}" transform="translate(-2 0)" fill="none" stroke="#ff1a0a" stroke-width="2.5" opacity=".5"/>
      </g>
      ${flapD ? `<g class="flap">
        <path d="${flapShadowD}" fill="#000" opacity=".7" filter="url(#soft)"/>
        <path d="${flapD}" fill="url(#flapGrad)"/>
        <path d="${flapD}" fill="#fff" filter="url(#grain)" opacity=".7"/>
        <path d="${flapEdgeD}" fill="none" stroke="#f3ece0" stroke-width="3" filter="url(#fibers)"/>
        <path d="M${f1(A[0])} ${f1(A[1])} L${f1(B[0])} ${f1(B[1])}" stroke="#000" stroke-opacity=".5" stroke-width="2"/>
      </g>` : ""}
      <g class="tapes">${tapes}</g>
      <g class="shreds">${shreds}</g>
      ${stamp}
    </g>
    <g id="slices" class="slices">
      <use href="#pl" clip-path="url(#sl0)" id="sl0u"/>
      <use href="#pl" clip-path="url(#sl1)" id="sl1u"/>
      <use href="#pl" clip-path="url(#sl2)" id="sl2u"/>
    </g>`;
  built = true;
  builtSize = w + "x" + h;
  document.getElementById("hero")?.classList.add("paper-ready");
}

// Glitch burst on the paper: chunks slide sideways, colour edges split
let paperBusy = false;
function paperGlitch(dur = 220) {
  if (!built || paperBusy || reduceMotion() || glitchLevel() === "off" || !specCache) return;
  paperBusy = true;
  const { h } = specCache;
  const big = glitchLevel() === "high" ? 1.6 : 1;
  const q = s => paper.querySelector(s);
  paper.classList.add("p-glitch");
  let steps = 0;
  const tick = () => {
    if (!q("#slices")) { paperBusy = false; return; }
    ["sl0", "sl1", "sl2"].forEach(id => {
      q(`#${id}r`).setAttribute("y", rand(0, h).toFixed(0));
      q(`#${id}r`).setAttribute("height", rand(6, 46).toFixed(0));
      q(`#${id}u`).setAttribute("transform", `translate(${(rand(-34, 34) * big).toFixed(1)} 0)`);
    });
    q("#rim-r").setAttribute("transform", `translate(${(rand(-10, -3) * big).toFixed(1)} ${rand(-2, 2).toFixed(1)})`);
    q("#rim-c").setAttribute("transform", `translate(${(rand(3, 10) * big).toFixed(1)} ${rand(-2, 2).toFixed(1)})`);
    q("#slices").style.display = "block";
    if (++steps < 3) setTimeout(tick, dur / 3);
    else setTimeout(() => {
      if (q("#slices")) {
        q("#slices").style.display = "none";
        q("#rim-r").setAttribute("transform", "translate(-2 0)");
        q("#rim-c").setAttribute("transform", "translate(2 0)");
      }
      paper.classList.remove("p-glitch");
      paperBusy = false;
    }, dur / 3);
  };
  tick();
}

// Opening: the right part rips off and falls, then the corner peels
function ripOpen() {
  buildPaper();
  if (reduceMotion()) { introDone = true; paper.classList.add("opened"); buildPaper(); return; }
  setTimeout(() => {
    paper.classList.add("ripping");
    setTimeout(() => { introDone = true; paper.classList.add("opened"); paper.classList.remove("ripping"); paperGlitch(260); }, 1250);
  }, 350);
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
  // the paper is a bit bigger than the hero, so these small moves never uncover the code at the edges
  paper.style.transform = `translate3d(${(mx * 10).toFixed(2)}px, ${(my * 8).toFixed(2)}px, 0)`;
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
  rT = setTimeout(() => { resizeRain(); buildPaper(); }, 150);
});

window.addEventListener("langchange", () => {
  renderPackages(); renderMarquee(); syncGlitchText(); renderFeatured(); buildPaper();
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
