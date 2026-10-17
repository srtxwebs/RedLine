import { t, esc, onUser, getProfile, toast, authErrorText, avatarHTML, googleIcon, doSignOut, isAdmin, adminLoginEmail, displayNameOf } from "./app.js";
import { signInGoogle, signInAdmin } from "./firebase.js";
import { applyTranslations } from "./i18n.js";

const $ = id => document.getElementById(id);
const gBtn = $("google-btn");
const aBtn = $("admin-btn");

// After signing in, go back to the page that sent you here (only pages of this site)
const params = new URLSearchParams(location.search);
const next = params.get("next");
const safeNext = next && /^[a-z]+\.html(#[a-z]+)?$/.test(next) ? next : null;

// ---- tabs ----
function setTab(tab) {
  $("auth-tabs").dataset.tab = tab;
  $("auth-tabs").querySelectorAll("button[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  });
  $("pane-customer").hidden = tab !== "customer";
  $("pane-admin").hidden = tab !== "admin";
  if (tab === "admin") setTimeout(() => $("a-user").focus(), 50);
}
$("auth-tabs").querySelectorAll("button[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
if (params.get("admin") === "1" || location.hash === "#admin") setTab("admin");

// ---- Google (customers) ----
function renderGoogle(busy = false) {
  gBtn.innerHTML = busy ? `<span class="spinner" style="border-color:#0003;border-top-color:#111"></span>` : `${googleIcon()}<span>${esc(t("login.google"))}</span>`;
  gBtn.disabled = busy;
}
gBtn.addEventListener("click", async () => {
  renderGoogle(true);
  try {
    await signInGoogle();
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast(authErrorText(e), "error");
  } finally {
    renderGoogle(false);
  }
});

// ---- Admin (username + password) ----
function renderAdminBtn(busy = false) {
  aBtn.innerHTML = busy ? `<span class="spinner"></span>` : esc(t("login.adminBtn"));
  aBtn.disabled = busy;
}
$("pw-toggle").addEventListener("click", () => {
  const i = $("a-pass");
  i.type = i.type === "password" ? "text" : "password";
});
$("pane-admin").addEventListener("submit", async e => {
  e.preventDefault();
  const user = $("a-user").value.trim();
  const pass = $("a-pass").value;
  if (!user || !pass) { toast(t("login.badCreds"), "error"); return; }
  renderAdminBtn(true);
  try {
    await signInAdmin(adminLoginEmail(user), pass);
    $("a-pass").value = "";
  } catch (err) {
    console.warn(err.code);
    const c = err.code || "";
    if (c === "auth/operation-not-allowed") toast(t("login.pwNotEnabled"), "error");
    else if (c === "auth/too-many-requests") toast(t("login.tooMany"), "error");
    else if (c === "app/not-configured") toast(t("config.missing"), "error");
    else if (c === "auth/unauthorized-domain") toast(t("login.unauthorized"), "error");
    else toast(t("login.badCreds"), "error");
  } finally {
    renderAdminBtn(false);
  }
});

$("login-signout").addEventListener("click", doSignOut);

function renderAll() { renderGoogle(); renderAdminBtn(); }
renderAll();
window.addEventListener("langchange", renderAll);

onUser(u => {
  $("login-out").hidden = !!u;
  $("login-in").hidden = !u;
  if (!u) return;
  if (isAdmin(u)) { location.href = safeNext || "admin.html"; return; }
  if (safeNext) { location.href = safeNext; return; }
  const p = getProfile();
  $("signed-in-box").innerHTML = `
    ${avatarHTML(p, u, "avatar-md")}
    <div><strong>${esc(displayNameOf(p, u))}</strong><span class="muted small">${esc(u.email)}</span></div>`;
  applyTranslations($("login-in"));
});
