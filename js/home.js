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
const NS = "http://www.w3.org/2000/svg";

// small seeded random so the tear keeps the same shape on resize
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// Build a jagged torn outline around an ellipse
function tearPoints(cx, cy, rx, ry, seed, prog = 1) {
  const r = seeded(seed);
  const n = 150;
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    let m = 1 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.09 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 9 + ph[2]);
    m += (r() - 0.5) * 0.07;                 // small jagged teeth
    if (r() < 0.06) m += r() * 0.09;         // occasional paper fibre spike
    const p = prog;
    pts.push([cx + Math.cos(a) * rx * m * p, cy + Math.sin(a) * ry * m * p]);
  }
  return pts;
}
const toPath = pts => "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + " Z";

function holeSpecs() {
  const rect = paper.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (w < 860) {
    return { w, h, holes: [{ cx: w * 0.58, cy: h * 0.83, rx: w * 0.55, ry: h * 0.15, seed: 7, flap: true }] };
  }
  return {
    w, h,
    holes: [
      { cx: w * 0.75, cy: h * 0.5, rx: w * 0.23, ry: h * 0.34, seed: 11, flap: true },
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

let built = false, openProg = 0;
function buildPaper(prog = 1) {
  const { w, h, holes } = holeSpecs();
  paper.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const shapes = holes.map(hs => ({ ...hs, pts: tearPoints(hs.cx, hs.cy, hs.rx, hs.ry, hs.seed, prog) }));
  const holeD = shapes.map(s => toPath(s.pts)).join(" ");

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
        <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
        <radialGradient id="paperShade" cx="25%" cy="40%" r="90%">
          <stop offset="0" stop-color="#161414"/><stop offset=".6" stop-color="#0d0c0c"/><stop offset="1" stop-color="#060606"/>
        </radialGradient>
        <linearGradient id="flapGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2b2725"/><stop offset=".55" stop-color="#191716"/><stop offset="1" stop-color="#0c0b0b"/>
        </linearGradient>
        <mask id="tearMask" maskUnits="userSpaceOnUse">
          <rect id="mask-rect" fill="#fff"/>
          <path id="mask-hole" fill="#000"/>
        </mask>
        <clipPath id="holeClip"><path id="clip-hole"/></clipPath>
      </defs>
      <g mask="url(#tearMask)">
        <rect id="paper-base" fill="url(#paperShade)"/>
        <rect id="paper-grain" fill="#fff" filter="url(#grain)"/>
        <path id="paper-rim" fill="none" stroke="#e8e0d2" stroke-width="9" filter="url(#fibers)" opacity=".92"/>
      </g>
      <g clip-path="url(#holeClip)">
        <path id="hole-shadow" fill="none" stroke="#000" stroke-width="46" filter="url(#soft)" opacity=".9"/>
      </g>
      <g id="flaps"></g>`;
    built = true;
  }
  ["mask-rect", "paper-base", "paper-grain"].forEach(id => {
    const el = paper.querySelector("#" + id);
    el.setAttribute("width", w); el.setAttribute("height", h);
  });
  ["mask-hole", "clip-hole", "paper-rim", "hole-shadow"].forEach(id => paper.querySelector("#" + id).setAttribute("d", holeD));

  // folded flaps (only once the tear is mostly open)
  const flaps = paper.querySelector("#flaps");
  flaps.innerHTML = prog > 0.6 ? shapes.filter(s => s.flap).map(s => {
    const d = flapPath(s.pts);
    return `<path d="${d}" fill="url(#flapGrad)" opacity="${Math.min(1, (prog - 0.6) * 2.5)}"/>
            <path d="${d}" fill="none" stroke="#e8e0d2" stroke-width="3" filter="url(#fibers)" opacity=".7"/>`;
  }).join("") : "";
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
    buildPaper(Math.max(0.001, openProg));
    if (p < 1) requestAnimationFrame(step);
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
let pRaf = 0;
window.addEventListener("scroll", () => {
  if (pRaf || reduceMotion()) return;
  pRaf = requestAnimationFrame(() => {
    pRaf = 0;
    const y = Math.min(window.scrollY, innerHeight);
    paper.style.transform = `translate3d(0, ${y * 0.18}px, 0)`;
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
  renderPackages(); renderMarquee(); syncGlitchText(); renderFeatured();
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
