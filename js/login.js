import { t, esc, onUser, getProfile, toast, authErrorText, avatarHTML, googleIcon, doSignOut } from "./app.js";
import { signInGoogle } from "./firebase.js";

const btn = document.getElementById("google-btn");

// After signing in, go back to the page that sent you here (only pages of this site)
const next = new URLSearchParams(location.search).get("next");
const safeNext = next && /^[a-z]+\.html(#[a-z]+)?$/.test(next) ? next : null;

function renderButton(busy = false) {
  btn.innerHTML = busy ? `<span class="spinner" style="border-color:#0003;border-top-color:#111"></span>` : `${googleIcon()}<span>${esc(t("login.google"))}</span>`;
  btn.disabled = busy;
}

btn.addEventListener("click", async () => {
  renderButton(true);
  try {
    await signInGoogle();
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast(authErrorText(e), "error");
  } finally {
    renderButton(false);
  }
});

document.getElementById("login-signout").addEventListener("click", doSignOut);

renderButton();
window.addEventListener("langchange", () => renderButton());

onUser(u => {
  document.getElementById("login-out").hidden = !!u;
  document.getElementById("login-in").hidden = !u;
  if (u) {
    if (safeNext) { location.href = safeNext; return; }
    const p = getProfile();
    document.getElementById("signed-in-box").innerHTML = `
      ${avatarHTML(p, u, "avatar-md")}
      <div><strong>${esc((p && p.displayName) || u.displayName || "")}</strong><span class="muted small">${esc(u.email)}</span></div>`;
  }
});
