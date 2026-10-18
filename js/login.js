import { SITE, t, esc, onUser, getProfile, toast, avatarHTML, googleIcon, doSignOut, isAdmin, loginIdToEmail, displayNameOf, authErrorText } from "./app.js";
import { signInGoogle, signInEmail, createAccount, resetPassword } from "./firebase.js";
import { applyTranslations } from "./i18n.js";

const $ = id => document.getElementById(id);

// After signing in, go back to the page that sent you here (only pages of this site)
const params = new URLSearchParams(location.search);
const next = params.get("next");
const safeNext = next && /^[a-z]+\.html(#[a-z]+)?$/.test(next) ? next : null;

let tab = params.get("mode") === "signup" ? "signup" : "signin";
let busy = false;
let actedHere = false; // true once the person signs in from this page

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const toEmail = loginIdToEmail;
const isKnownUsername = v => SITE.adminUsers.includes(v.trim().toLowerCase());
const errorText = authErrorText;

// ---------- tabs ----------
function setTab(next, focus = true) {
  tab = next;
  $("auth-tabs").dataset.tab = tab;
  $("auth-tabs").querySelectorAll("button[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  });
  $("pane-signin").hidden = tab !== "signin";
  $("pane-signup").hidden = tab !== "signup";
  $("auth-title").setAttribute("data-i18n", tab === "signin" ? "login.welcomeBack" : "login.createTitle");
  $("auth-sub").setAttribute("data-i18n", tab === "signin" ? "login.signinSub" : "login.createSub");
  $("si-error").textContent = ""; $("su-error").textContent = "";
  applyTranslations($("login-out"));
  if (focus) setTimeout(() => $(tab === "signin" ? "si-email" : "su-name").focus(), 60);
}
$("auth-tabs").querySelectorAll("button[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.go)));

// ---------- buttons ----------
function renderButtons() {
  $("google-btn").innerHTML = `${googleIcon()}<span>${esc(t("login.google"))}</span>`;
  $("google-btn").disabled = busy;
  $("si-btn").innerHTML = busy && tab === "signin" ? `<span class="spinner"></span>` : esc(t("login.signinBtn"));
  $("su-btn").innerHTML = busy && tab === "signup" ? `<span class="spinner"></span>` : esc(t("login.createBtn"));
  $("si-btn").disabled = $("su-btn").disabled = busy;
}

document.querySelectorAll("[data-pw]").forEach(b => b.addEventListener("click", () => {
  const ids = b.dataset.pw === "su-pass" ? ["su-pass", "su-pass2"] : [b.dataset.pw];
  const show = $(ids[0]).type === "password";
  ids.forEach(id => { $(id).type = show ? "text" : "password"; });
  b.classList.toggle("on", show);
}));

// password strength bar
$("su-pass").addEventListener("input", () => {
  const v = $("su-pass").value;
  let score = 0;
  if (v.length >= 6) score++;
  if (v.length >= 10) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
  const bar = $("pw-bar");
  bar.style.width = `${Math.max(v ? 12 : 0, score * 25)}%`;
  bar.dataset.level = String(score);
});

async function run(errorEl, fn) {
  if (busy) return;
  errorEl.textContent = "";
  busy = true; renderButtons();
  try {
    actedHere = true;
    await fn();
  } catch (e) {
    actedHere = false;
    console.warn(e.code || e);
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      errorEl.textContent = errorText(e);
      errorEl.closest("form")?.classList.remove("shake"); void errorEl.offsetWidth;
      errorEl.closest("form")?.classList.add("shake");
    }
  } finally {
    busy = false; renderButtons();
  }
}

$("google-btn").addEventListener("click", () => run($(tab === "signin" ? "si-error" : "su-error"), () => signInGoogle()));

$("pane-signin").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("si-email").value.trim();
  const pass = $("si-pass").value;
  if (!id || !pass) { $("si-error").textContent = t("login.err.fill"); return; }
  if (id.includes("@") && !EMAIL_RE.test(id)) { $("si-error").textContent = t("login.err.email"); return; }
  run($("si-error"), () => signInEmail(toEmail(id), pass));
});

$("pane-signup").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("su-name").value.trim();
  const id = $("su-email").value.trim();
  const pass = $("su-pass").value;
  const pass2 = $("su-pass2").value;
  const err = $("su-error");
  const ownerAccount = !id.includes("@") && isKnownUsername(id);
  if ((!name && !ownerAccount) || !id || !pass || !pass2) { err.textContent = t("login.err.fill"); return; }
  if (!ownerAccount && !EMAIL_RE.test(id)) { err.textContent = t("login.err.email"); return; }
  if (pass.length < 6) { err.textContent = t("login.err.weak"); return; }
  if (pass !== pass2) { err.textContent = t("login.err.match"); return; }
  try { if (name) sessionStorage.setItem("pendingName", name); } catch {}
  run(err, () => createAccount(toEmail(id), pass, name));
});

$("forgot").addEventListener("click", async () => {
  const id = $("si-email").value.trim();
  if (!EMAIL_RE.test(id)) { $("si-error").textContent = t("login.resetNeedEmail"); $("si-email").focus(); return; }
  try {
    await resetPassword(id.toLowerCase());
    toast(t("login.resetSent"));
  } catch (e) {
    $("si-error").textContent = errorText(e);
  }
});

$("login-signout").addEventListener("click", doSignOut);

renderButtons();
setTab(tab, false);
window.addEventListener("langchange", () => { renderButtons(); });

onUser(u => {
  $("login-out").hidden = !!u;
  $("login-in").hidden = !u;
  if (!u) return;
  if (actedHere) {
    const name = displayNameOf(getProfile(), u);
    if (name) toast(t("login.welcome", { name }));
    setTimeout(() => { location.href = isAdmin(u) ? "admin.html" : (safeNext || "profile.html"); }, 450);
    return;
  }
  if (safeNext) { location.href = safeNext; return; }
  const p = getProfile();
  $("signed-in-box").innerHTML = `
    ${avatarHTML(p, u, "avatar-md")}
    <div><strong>${esc(displayNameOf(p, u))}</strong><span class="muted small">${esc(u.email)}</span></div>`;
  $("go-btn").href = isAdmin(u) ? "admin.html" : "profile.html";
  $("go-btn").setAttribute("data-i18n", isAdmin(u) ? "nav.admin" : "login.goProfile");
  applyTranslations($("login-in"));
});
