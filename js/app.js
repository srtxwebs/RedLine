// Shared code for every page: header, footer, language switch, login state, animations, toasts.
import { SITE } from "./config.js";
import { t, applyTranslations, getLang, setLang, hasExplicitLang } from "./i18n.js";
import { auth, db, fb, isConfigured, signInGoogle, signInEmail, signOutUser, onAuthStateChanged, setAuthLang } from "./firebase.js";

export { SITE, t, getLang, setLang, db, fb, isConfigured };

let user = null;
let profile = null;
let resolved = false;
const subs = new Set();

export const getUser = () => user;
export const getProfile = () => profile;

export const adminLoginEmail = username => `${String(username).trim().toLowerCase()}@${SITE.adminLoginDomain}`;
// What someone types in the "Email" box → the account email
export const loginIdToEmail = v => (String(v).includes("@") ? String(v).trim().toLowerCase() : adminLoginEmail(v));

export function isAdmin(u = user) {
  if (!u || !u.email) return false;
  const email = u.email.toLowerCase();
  return SITE.adminUsers.map(adminLoginEmail).includes(email) || SITE.adminEmails.map(e => e.toLowerCase()).includes(email);
}

// Pages call onUser(fn) to react when someone signs in / out
export function onUser(cb) {
  subs.add(cb);
  if (resolved) cb(user, profile);
  return () => subs.delete(cb);
}

export function setProfile(patch) {
  profile = { ...(profile || {}), ...patch };
  renderAuthSlot();
}

// Ask the visitor to sign in (Google or email) without leaving the page
export async function ensureSignedIn() {
  if (user) return user;
  if (!isConfigured) {
    toast(t("config.missing"), "error");
    throw new Error("not-configured");
  }
  const u = await openAuthModal();
  if (!u) throw Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
  return u;
}

export async function doSignOut() {
  await signOutUser();
  location.href = "index.html";
}

// ---------- helpers ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

export function avatarSrc(p, u) {
  if (p && p.photo === "none") return "";
  return (p && p.photo) || (p && p.googlePhoto) || (u && u.photoURL) || "";
}

export function displayNameOf(p, u) {
  if (p && p.displayName) return p.displayName;
  if (u && u.displayName) return u.displayName;
  if (u && u.email) return u.email.split("@")[0];
  return "";
}

export function avatarHTML(p, u, cls = "") {
  const src = avatarSrc(p, u);
  const name = displayNameOf(p, u) || "?";
  return src
    ? `<img class="avatar ${cls}" src="${esc(src)}" alt="" referrerpolicy="no-referrer" decoding="async">`
    : `<span class="avatar avatar-initials ${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}

let toastTimer;
export function toast(msg, type = "ok") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 3800);
}

export function authErrorText(e) {
  const c = (e && e.code) || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(c)) return t("login.err.wrong");
  if (c === "auth/email-already-in-use") return t("login.err.inUse");
  if (c === "auth/weak-password") return t("login.err.weak");
  if (c === "auth/invalid-email" || c === "auth/missing-email") return t("login.err.email");
  if (c === "auth/operation-not-allowed") return t("login.err.disabled");
  if (c === "auth/too-many-requests") return t("login.tooMany");
  if (c === "auth/unauthorized-domain") return t("login.unauthorized");
  if (c === "app/not-configured") return t("config.missing");
  return t("login.error");
}

export const reduceMotion = () =>
  document.documentElement.classList.contains("reduce-motion") ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Compress an image file → JPEG data URL (no paid storage needed)
export async function imageToDataURL(file, maxSide = 1280, quality = 0.78, square = false) {
  if (!file || !file.type.startsWith("image/")) throw new Error("bad-image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ICON_GOOGLE = `<svg class="g-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
export const googleIcon = () => ICON_GOOGLE;

const EYE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

const currentPage = () => (location.pathname.split("/").pop() || "index.html") + (location.hash || "");

// Sign-in box used by pages that need an account
export function gateHTML() {
  return `<div class="card gate reveal">
    <div class="gate-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </div>
    <h2 data-i18n="gate.title"></h2>
    <p class="muted" data-i18n="gate.sub"></p>
    <div class="gate-btns">
      <button class="btn btn-google" type="button" data-gate-signin>${ICON_GOOGLE}<span data-i18n="gate.btn"></span></button>
      <a class="btn btn-ghost" href="login.html?next=${encodeURIComponent(currentPage())}" data-i18n="gate.email"></a>
    </div>
  </div>`;
}

export function wireGate(root) {
  applyTranslations(root);
  root.querySelectorAll("[data-gate-signin]").forEach(b => b.addEventListener("click", async () => {
    try { await signInGoogle(); } catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast(authErrorText(e), "error"); }
  }));
}

// ---------- quick sign-in popup (used when booking / sending a request) ----------
let authModal = null, authResolve = null;
function buildAuthModal() {
  authModal = document.createElement("div");
  authModal.className = "modal";
  authModal.hidden = true;
  authModal.setAttribute("role", "dialog");
  authModal.setAttribute("aria-modal", "true");
  authModal.innerHTML = `
    <div class="modal-backdrop" data-am-close></div>
    <div class="modal-panel auth-modal">
      <button type="button" class="modal-close" data-am-close data-i18n-aria="auth.close">✕</button>
      <h2 data-i18n="login.welcomeBack"></h2>
      <p class="muted" data-i18n="login.signinSub"></p>
      <button type="button" class="btn btn-google btn-block" id="am-google">${ICON_GOOGLE}<span data-i18n="login.google"></span></button>
      <div class="or-line"><span data-i18n="login.or"></span></div>
      <form id="am-form" novalidate>
        <div class="field">
          <label for="am-email" data-i18n="login.email"></label>
          <input id="am-email" type="text" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false">
        </div>
        <div class="field">
          <label for="am-pass" data-i18n="login.password"></label>
          <div class="pw-wrap">
            <input id="am-pass" type="password" autocomplete="current-password">
            <button type="button" class="pw-toggle" id="am-eye" data-i18n-aria="login.show">${EYE}</button>
          </div>
        </div>
        <p class="form-error" id="am-error" role="alert"></p>
        <button type="submit" class="btn btn-red btn-block" id="am-btn" data-i18n="login.signinBtn"></button>
      </form>
      <p class="switch-line"><span data-i18n="login.noAccount"></span> <a class="link-btn" id="am-signup" data-i18n="login.tabSignup"></a></p>
    </div>`;
  document.body.appendChild(authModal);
  const err = authModal.querySelector("#am-error");
  const fail = e => {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    err.textContent = authErrorText(e);
  };
  authModal.querySelectorAll("[data-am-close]").forEach(b => b.addEventListener("click", () => closeAuthModal(null)));
  authModal.querySelector("#am-eye").addEventListener("click", () => {
    const i = authModal.querySelector("#am-pass"); i.type = i.type === "password" ? "text" : "password";
  });
  authModal.querySelector("#am-google").addEventListener("click", async () => {
    err.textContent = "";
    try { await signInGoogle(); } catch (e) { fail(e); }
  });
  authModal.querySelector("#am-form").addEventListener("submit", async e => {
    e.preventDefault();
    err.textContent = "";
    const id = authModal.querySelector("#am-email").value.trim();
    const pass = authModal.querySelector("#am-pass").value;
    if (!id || !pass) { err.textContent = t("login.err.fill"); return; }
    const btn = authModal.querySelector("#am-btn");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try { await signInEmail(loginIdToEmail(id), pass); } catch (e2) { fail(e2); }
    btn.disabled = false; btn.textContent = t("login.signinBtn");
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && authModal && !authModal.hidden) closeAuthModal(null); });
}

function openAuthModal() {
  if (!authModal) buildAuthModal();
  authModal.querySelector("#am-signup").href = `login.html?mode=signup&next=${encodeURIComponent(currentPage())}`;
  authModal.querySelector("#am-error").textContent = "";
  applyTranslations(authModal);
  authModal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => authModal.querySelector("#am-email").focus(), 60);
  return new Promise(res => { authResolve = res; });
}

function closeAuthModal(u) {
  if (!authModal || authModal.hidden) return;
  authModal.hidden = true;
  document.body.style.overflow = "";
  const r = authResolve; authResolve = null;
  if (r) r(u);
}

// ---------- header & footer ----------
const NAV_ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  shop: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M7 21h10"/><circle cx="6" cy="6" r=".6"/>',
  book: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 15h2M13 15h3"/>',
  custom: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>',
  admin: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
const navIcon = k => `<svg class="nav-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[k]}</svg>`;

function navLink(href, key, page, extra = "") {
  const active = document.body.dataset.page === page;
  return `<a href="${href}" class="${active ? "active" : ""} ${extra}"${active ? ' aria-current="page"' : ""}>${navIcon(page)}<span data-i18n="${key}"></span></a>`;
}

const brandHTML = () => {
  const first = esc(SITE.brand.charAt(0));
  return `<span class="logo-mark" aria-hidden="true"><span>${first}</span></span>
    <span class="logo-text">${esc(SITE.brand)}<span class="logo-dot">.</span></span>`;
};

function mountHeader() {
  const host = document.getElementById("site-header");
  if (!host) return;
  host.innerHTML = `
  <div class="top-progress" aria-hidden="true"></div>
  <header class="site-header">
    <div class="nav-shell">
      <a class="logo" href="index.html">${brandHTML()}</a>
      <nav class="main-nav" id="main-nav">
        <span class="nav-indicator" aria-hidden="true"></span>
        ${navLink("index.html", "nav.home", "home")}
        ${navLink("shop.html", "nav.shop", "shop")}
        ${navLink("book.html", "nav.book", "book")}
        ${navLink("custom.html", "nav.custom", "custom")}
        ${navLink("admin.html", "nav.admin", "admin", "admin-link")}
      </nav>
      <div class="header-actions">
        <div class="lang-switch" role="group" data-i18n-aria="nav.language">
          <span class="lang-knob" aria-hidden="true"></span>
          <button type="button" data-lang="en">EN</button>
          <button type="button" data-lang="es">ES</button>
        </div>
        <div id="auth-slot" class="auth-slot"></div>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" data-i18n-aria="nav.menu">
          <span></span><span></span>
        </button>
      </div>
      <span class="nav-progress" aria-hidden="true"></span>
    </div>
  </header>`;

  host.querySelector(".admin-link").hidden = true;
  host.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
  const toggle = host.querySelector(".menu-toggle");
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", e => {
    const menu = document.querySelector(".user-menu");
    if (menu && !menu.contains(e.target)) menu.classList.remove("open");
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.querySelector(".user-menu")?.classList.remove("open");
      document.body.classList.remove("nav-open");
    }
  });

  // Header gets solid when scrolling + red reading-progress line
  const header = host.querySelector(".site-header");
  const shell = host.querySelector(".nav-shell");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      header.classList.toggle("scrolled", y > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      shell.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
      ticking = false;
    });
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Sliding red pill behind the nav links
  const nav = host.querySelector(".main-nav");
  const ind = nav.querySelector(".nav-indicator");
  const links = () => [...nav.querySelectorAll("a:not([hidden])")];
  const moveTo = (el, instant = false) => {
    links().forEach(a => a.classList.toggle("hl", a === el));
    if (!el || window.innerWidth <= 860) { ind.style.opacity = "0"; return; }
    if (instant) ind.style.transition = "none";
    ind.style.opacity = "1";
    ind.style.width = `${el.offsetWidth}px`;
    ind.style.transform = `translateX(${el.offsetLeft}px)`;
    if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
  };
  const activeLink = () => nav.querySelector("a.active:not([hidden])");
  nav.querySelectorAll("a").forEach(a => a.addEventListener("mouseenter", () => moveTo(a)));
  nav.addEventListener("mouseleave", () => moveTo(activeLink()));
  window.addEventListener("resize", () => moveTo(activeLink(), true));
  window.addEventListener("langchange", () => requestAnimationFrame(() => moveTo(activeLink(), true)));
  document.fonts?.ready.then(() => moveTo(activeLink(), true));
  requestAnimationFrame(() => moveTo(activeLink(), true));
  header.addEventListener("navrefresh", () => moveTo(activeLink(), true));
}

function renderAuthSlot() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  const adminLink = document.querySelector(".admin-link");
  if (adminLink && adminLink.hidden !== !isAdmin()) {
    adminLink.hidden = !isAdmin();
    document.querySelector(".site-header")?.dispatchEvent(new Event("navrefresh"));
  }

  if (!resolved) { slot.innerHTML = `<span class="avatar avatar-skeleton"></span>`; return; }

  if (!user) {
    slot.innerHTML = `<a class="btn btn-red btn-sm signin-btn" href="login.html"><span data-i18n="nav.signin"></span></a>`;
  } else {
    const name = displayNameOf(profile, user);
    slot.innerHTML = `
      <div class="user-menu">
        <button type="button" class="user-btn" aria-haspopup="menu" data-i18n-aria="nav.account">
          ${avatarHTML(profile, user, "avatar-sm")}
        </button>
        <div class="user-dropdown" role="menu">
          <div class="user-dropdown-head">
            ${avatarHTML(profile, user, "avatar-md")}
            <div><strong>${esc(name)}</strong><span class="muted small">${esc(user.email)}</span></div>
          </div>
          <a role="menuitem" href="profile.html" data-i18n="nav.profile"></a>
          <a role="menuitem" href="settings.html" data-i18n="nav.settings"></a>
          ${isAdmin() ? `<a role="menuitem" href="admin.html" class="menu-admin" data-i18n="nav.admin"></a>` : ""}
          <button role="menuitem" type="button" class="signout-btn" data-i18n="nav.signout"></button>
        </div>
      </div>`;
    const menu = slot.querySelector(".user-menu");
    slot.querySelector(".user-btn").addEventListener("click", e => { e.stopPropagation(); menu.classList.toggle("open"); });
    slot.querySelector(".signout-btn").addEventListener("click", doSignOut);
  }
  applyTranslations(slot);
}

function mountFooter() {
  const host = document.getElementById("site-footer");
  if (!host) return;
  host.innerHTML = `
  <footer class="site-footer">
    <div class="footer-tear" aria-hidden="true"></div>
    <div class="container footer-grid">
      <div>
        <a class="logo" href="index.html">${brandHTML()}</a>
        <p class="muted" data-i18n="footer.tagline"></p>
      </div>
      <div>
        <h4 data-i18n="footer.pages"></h4>
        <a href="index.html" data-i18n="nav.home"></a>
        <a href="shop.html" data-i18n="nav.shop"></a>
        <a href="book.html" data-i18n="nav.book"></a>
        <a href="custom.html" data-i18n="nav.custom"></a>
      </div>
      <div>
        <h4 data-i18n="footer.account"></h4>
        <a href="login.html" data-i18n="nav.signin"></a>
        <a href="profile.html" data-i18n="nav.profile"></a>
        <a href="settings.html" data-i18n="nav.settings"></a>
      </div>
    </div>
    <div class="footer-wordmark" aria-hidden="true">${esc(SITE.brand)}</div>
    <div class="container footer-bottom">
      <span>© ${new Date().getFullYear()} ${esc(SITE.brand)}. <span data-i18n="footer.rights"></span></span>
    </div>
  </footer>`;
}

function showConfigBanner() {
  const b = document.createElement("div");
  b.className = "config-banner";
  b.setAttribute("data-i18n", "config.missing");
  document.body.appendChild(b);
}

// ---------- animations ----------
// Big headings rise in word by word
function splitHeadings() {
  document.querySelectorAll(".page-head h1[data-i18n], .section-head h2[data-i18n]").forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", el.textContent.trim());
    el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`).join(" ");
    el.classList.add("split");
  });
}

function setupReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach(e => e.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  const watch = root => root.querySelectorAll?.(".reveal:not(.in):not([data-watched])").forEach(e => { e.dataset.watched = "1"; io.observe(e); });
  watch(document);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.matches?.(".reveal:not(.in)") && !n.dataset.watched) { n.dataset.watched = "1"; io.observe(n); }
    watch(n);
  }))).observe(document.body, { childList: true, subtree: true });
}

// Cursor spotlight on cards, 3D tilt on .tilt cards, magnetic buttons (all GPU-friendly)
function setupPointerFX() {
  if (window.matchMedia("(hover: none)").matches) return;
  let raf = 0, lastEvt = null;
  const apply = () => {
    raf = 0;
    const e = lastEvt;
    if (!e) return;
    const card = e.target.closest?.(".spot");
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
      if (card.classList.contains("tilt") && !reduceMotion()) {
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", `${(px * 7).toFixed(2)}deg`);
        card.style.setProperty("--rx", `${(-py * 7).toFixed(2)}deg`);
      }
    }
    if (reduceMotion()) return;
    const mag = e.target.closest?.(".magnetic");
    if (mag) {
      const r = mag.getBoundingClientRect();
      mag.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.2}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    }
  };
  document.addEventListener("pointermove", e => { lastEvt = e; if (!raf) raf = requestAnimationFrame(apply); }, { passive: true });
  document.addEventListener("pointerout", e => {
    const mag = e.target.closest?.(".magnetic");
    if (mag && !mag.contains(e.relatedTarget)) mag.style.transform = "";
    const tilt = e.target.closest?.(".tilt");
    if (tilt && !tilt.contains(e.relatedTarget)) { tilt.style.setProperty("--rx", "0deg"); tilt.style.setProperty("--ry", "0deg"); }
  });
}

// Smooth page changes. Modern browsers use native view transitions (no delay);
// older ones get a quick fade.
function setupPageTransitions() {
  const native = "onpagereveal" in window;
  if (native) return;
  document.addEventListener("click", e => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download") || /^(https?:|mailto:|tel:)/i.test(href)) return;
    if (reduceMotion()) return;
    e.preventDefault();
    document.body.classList.add("leaving");
    setTimeout(() => { location.href = href; }, 140);
  });
  window.addEventListener("pageshow", () => document.body.classList.remove("leaving"));
}

// ---------- profile in database ----------
async function loadOrCreateProfile(u) {
  const ref = fb.doc(db, "users", u.uid);
  try {
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) {
      let pending = "";
      try { pending = sessionStorage.getItem("pendingName") || ""; sessionStorage.removeItem("pendingName"); } catch {}
      const data = {
        uid: u.uid,
        email: u.email,
        displayName: (pending || u.displayName || (u.email || "").split("@")[0]).slice(0, 80),
        googlePhoto: u.photoURL || "",
        photo: "",
        phone: "",
        company: "",
        bio: "",
        banner: "red",
        lang: getLang(),
        createdAt: fb.serverTimestamp()
      };
      await fb.setDoc(ref, data);
      return { ...data, createdAt: new Date() };
    }
    const p = snap.data();
    if (u.photoURL && p.googlePhoto !== u.photoURL) {
      p.googlePhoto = u.photoURL;
      fb.updateDoc(ref, { googlePhoto: u.photoURL }).catch(() => {});
    }
    if (p.lang && !hasExplicitLang()) setLang(p.lang);
    return p;
  } catch (e) {
    console.warn("Profile load failed (check firestore.rules):", e);
    return { uid: u.uid, email: u.email, displayName: u.displayName || "", googlePhoto: u.photoURL || "", photo: "" };
  }
}

function emit() {
  resolved = true;
  renderAuthSlot();
  if (user) closeAuthModal(user);
  subs.forEach(cb => { try { cb(user, profile); } catch (e) { console.error(e); } });
}

// ---------- start ----------
function init() {
  try { if (localStorage.getItem("site.reduceMotion") === "1") document.documentElement.classList.add("reduce-motion"); } catch {}
  mountHeader();
  mountFooter();
  if (!isConfigured) showConfigBanner();
  renderAuthSlot();
  applyTranslations();
  splitHeadings();
  setupReveal();
  setupPointerFX();
  setupPageTransitions();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("loaded")));

  window.addEventListener("langchange", () => {
    splitHeadings();
    setAuthLang(getLang());
    renderAuthSlot();
    if (authModal && !authModal.hidden) applyTranslations(authModal);
    if (user && profile && profile.lang !== getLang()) {
      profile.lang = getLang();
      fb.updateDoc(fb.doc(db, "users", user.uid), { lang: getLang() }).catch(() => {});
    }
  });

  if (!isConfigured) { emit(); return; }
  setAuthLang(getLang());
  onAuthStateChanged(auth, async u => {
    user = u;
    profile = u ? await loadOrCreateProfile(u) : null;
    emit();
  });
}

init();
