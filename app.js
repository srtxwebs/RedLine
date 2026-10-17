// Shared code for every page: header, footer, language switch, Google login state, toasts.
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

export function isAdmin(u = user) {
  if (!u || !u.email) return false;
  return SITE.adminEmails.map(e => e.toLowerCase()).includes(u.email.toLowerCase());
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

export function avatarHTML(p, u, cls = "") {
  const src = avatarSrc(p, u);
  const name = (p && p.displayName) || (u && (u.displayName || u.email)) || "?";
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

const ICON_GOOGLE = `<svg class="g-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
export const googleIcon = () => ICON_GOOGLE;

// Sign-in box used by pages that need an account
export function gateHTML() {
  return `<div class="card gate">
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
function navLink(href, key, page) {
  const active = document.body.dataset.page === page ? ' class="active" aria-current="page"' : "";
  return `<a href="${href}"${active} data-i18n="${key}"></a>`;
}

function mountHeader() {
  const host = document.getElementById("site-header");
  if (!host) return;
  host.innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="logo" href="index.html">
        <span class="logo-mark" aria-hidden="true">${esc(SITE.brand.charAt(0))}</span>
        <span class="logo-text">${esc(SITE.brand)}</span>
      </a>
      <nav class="main-nav" id="main-nav">
        ${navLink("index.html", "nav.home", "home")}
        ${navLink("book.html", "nav.book", "book")}
        ${navLink("custom.html", "nav.custom", "custom")}
        <a href="admin.html" class="admin-link${document.body.dataset.page === "admin" ? " active" : ""}" hidden data-i18n="nav.admin"></a>
      </nav>
      <div class="header-actions">
        <div class="lang-switch" role="group" data-i18n-aria="nav.language">
          <button type="button" data-lang="en">EN</button>
          <button type="button" data-lang="es">ES</button>
        </div>
        <div id="auth-slot" class="auth-slot"></div>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" data-i18n-aria="nav.menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>`;

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
}

function renderAuthSlot() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  const adminLink = document.querySelector(".admin-link");
  if (adminLink) adminLink.hidden = !isAdmin();

  if (!resolved) { slot.innerHTML = `<span class="avatar avatar-skeleton"></span>`; return; }

  if (!user) {
    slot.innerHTML = `<a class="btn btn-red btn-sm" href="login.html" data-i18n="nav.signin"></a>`;
  } else {
    const name = (profile && profile.displayName) || user.displayName || user.email;
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
          ${isAdmin() ? `<a role="menuitem" href="admin.html" data-i18n="nav.admin"></a>` : ""}
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
    <div class="container footer-grid">
      <div>
        <a class="logo" href="index.html">
          <span class="logo-mark" aria-hidden="true">${esc(SITE.brand.charAt(0))}</span>
          <span class="logo-text">${esc(SITE.brand)}</span>
        </a>
        <p class="muted" data-i18n="footer.tagline"></p>
      </div>
      <div>
        <h4 data-i18n="footer.pages"></h4>
        <a href="index.html" data-i18n="nav.home"></a>
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
    <div class="container footer-bottom">
      <span>© ${new Date().getFullYear()} ${esc(SITE.brand)}. <span data-i18n="footer.rights"></span></span>
    </div>
  </footer>`;
}

function showConfigBanner() {
  const b = document.createElement("div");
  b.className = "config-banner";
  b.setAttribute("data-i18n", "config.missing");
  document.body.prepend(b);
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
        displayName: u.displayName || "",
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
