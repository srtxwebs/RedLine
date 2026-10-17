// Shared code for every page: header, footer, language switch, login state, animations, toasts.
import { SITE } from "./config.js";
import { t, applyTranslations, getLang, setLang, hasExplicitLang } from "./i18n.js";
import { auth, db, fb, isConfigured, signInGoogle, signOutUser, onAuthStateChanged, setAuthLang } from "./firebase.js";

export { SITE, t, getLang, setLang, db, fb, isConfigured };

let user = null;
let profile = null;
let resolved = false;
const subs = new Set();

export const getUser = () => user;
export const getProfile = () => profile;

export const adminLoginEmail = username => `${String(username).trim().toLowerCase()}@${SITE.adminLoginDomain}`;

export function isAdmin(u = user) {
  if (!u || !u.email) return false;
  const email = u.email.toLowerCase();
  const usernameAdmins = SITE.adminUsers.map(adminLoginEmail);
  const googleAdmins = SITE.adminEmails.map(e => e.toLowerCase());
  return usernameAdmins.includes(email) || googleAdmins.includes(email);
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

export async function ensureSignedIn() {
  if (user) return user;
  if (!isConfigured) {
    toast(t("config.missing"), "error");
    throw new Error("not-configured");
  }
  await signInGoogle();
  if (user) return user;
  return new Promise(res => {
    const off = onUser(u => { if (u) { queueMicrotask(() => off()); res(u); } });
  });
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
  if (u && isAdmin(u) && u.email && u.email.endsWith("@" + SITE.adminLoginDomain)) return u.email.split("@")[0];
  return (u && u.email) || "";
}

export function avatarHTML(p, u, cls = "") {
  const src = avatarSrc(p, u);
  const name = displayNameOf(p, u) || "?";
  return src
    ? `<img class="avatar ${cls}" src="${esc(src)}" alt="" referrerpolicy="no-referrer">`
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
  if (!e) return t("common.error");
  if (e.code === "auth/unauthorized-domain") return t("login.unauthorized");
  if (e.code === "app/not-configured") return t("config.missing");
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

// Sign-in box used by pages that need an account
export function gateHTML() {
  return `<div class="card gate reveal">
    <div class="gate-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </div>
    <h2 data-i18n="gate.title"></h2>
    <p class="muted" data-i18n="gate.sub"></p>
    <button class="btn btn-google" type="button" data-gate-signin>${ICON_GOOGLE}<span data-i18n="gate.btn"></span></button>
  </div>`;
}

export function wireGate(root) {
  applyTranslations(root);
  root.querySelectorAll("[data-gate-signin]").forEach(b => b.addEventListener("click", async () => {
    try { await ensureSignedIn(); } catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.message !== "not-configured") toast(authErrorText(e), "error"); }
  }));
}

// ---------- header & footer ----------
function navLink(href, key, page, extra = "") {
  const active = document.body.dataset.page === page;
  return `<a href="${href}" class="${active ? "active" : ""} ${extra}"${active ? ' aria-current="page"' : ""} data-i18n="${key}"></a>`;
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

  // Header gets solid when scrolling
  const header = host.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Sliding red indicator under the nav links
  const nav = host.querySelector(".main-nav");
  const ind = nav.querySelector(".nav-indicator");
  const moveTo = el => {
    if (!el || window.innerWidth <= 860) { ind.style.opacity = "0"; return; }
    ind.style.opacity = "1";
    ind.style.width = `${el.offsetWidth}px`;
    ind.style.transform = `translateX(${el.offsetLeft}px)`;
  };
  const activeLink = () => nav.querySelector("a.active:not([hidden])");
  nav.querySelectorAll("a").forEach(a => a.addEventListener("mouseenter", () => moveTo(a)));
  nav.addEventListener("mouseleave", () => moveTo(activeLink()));
  window.addEventListener("resize", () => moveTo(activeLink()));
  window.addEventListener("langchange", () => requestAnimationFrame(() => moveTo(activeLink())));
  document.fonts?.ready.then(() => moveTo(activeLink()));
  requestAnimationFrame(() => moveTo(activeLink()));
}

function renderAuthSlot() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  const adminLink = document.querySelector(".admin-link");
  if (adminLink) adminLink.hidden = !isAdmin();

  if (!resolved) { slot.innerHTML = `<span class="avatar avatar-skeleton"></span>`; return; }

  if (!user) {
    slot.innerHTML = `<a class="btn btn-red btn-sm" href="login.html"><span data-i18n="nav.signin"></span></a>`;
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
    if (n.matches?.(".reveal:not(.in)")) { n.dataset.watched = "1"; io.observe(n); }
    watch(n);
  }))).observe(document.body, { childList: true, subtree: true });
}

// Cursor spotlight on cards + magnetic buttons
function setupPointerFX() {
  if (window.matchMedia("(hover: none)").matches) return;
  document.addEventListener("pointermove", e => {
    const card = e.target.closest?.(".spot");
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    if (reduceMotion()) return;
    const mag = e.target.closest?.(".magnetic");
    if (mag) {
      const r = mag.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.22;
      const y = (e.clientY - r.top - r.height / 2) * 0.32;
      mag.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, { passive: true });
  document.addEventListener("pointerout", e => {
    const mag = e.target.closest?.(".magnetic");
    if (mag && !mag.contains(e.relatedTarget)) mag.style.transform = "";
  });
}

// Smooth fade between pages
function setupPageTransitions() {
  document.addEventListener("click", e => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download") || /^(https?:|mailto:|tel:)/i.test(href)) return;
    if (reduceMotion()) return;
    e.preventDefault();
    document.body.classList.add("leaving");
    setTimeout(() => { location.href = href; }, 220);
  });
  window.addEventListener("pageshow", () => document.body.classList.remove("leaving"));
}

// ---------- profile in database ----------
async function loadOrCreateProfile(u) {
  const ref = fb.doc(db, "users", u.uid);
  try {
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) {
      const data = {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || (isAdmin(u) ? u.email.split("@")[0] : ""),
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
  setupReveal();
  setupPointerFX();
  setupPageTransitions();
  requestAnimationFrame(() => document.body.classList.add("loaded"));

  window.addEventListener("langchange", () => {
    setAuthLang(getLang());
    renderAuthSlot();
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
