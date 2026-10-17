import { t, esc, onUser, getProfile, toast, avatarHTML, gateHTML, wireGate, doSignOut } from "./app.js";
import { getLang, setLang } from "./i18n.js";

const cards = document.querySelectorAll("[data-lang-card]");
const motion = document.getElementById("s-motion");

function renderLang() {
  cards.forEach(c => {
    const on = c.dataset.langCard === getLang();
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

cards.forEach(c => c.addEventListener("click", () => {
  if (c.dataset.langCard === getLang()) return;
  setLang(c.dataset.langCard);
  toast(t("settings.langSaved"));
}));

try { motion.checked = localStorage.getItem("site.reduceMotion") === "1"; } catch {}
motion.addEventListener("change", () => {
  document.documentElement.classList.toggle("reduce-motion", motion.checked);
  try { localStorage.setItem("site.reduceMotion", motion.checked ? "1" : "0"); } catch {}
});

let currentUser = null;
function renderAccount() {
  const box = document.getElementById("s-account");
  const u = currentUser;
  if (!u) {
    box.innerHTML = gateHTML();
    box.querySelector(".gate").style.margin = "0 auto";
    wireGate(box);
    return;
  }
  const p = getProfile();
  box.innerHTML = `
    <div class="signed-in-box">
      ${avatarHTML(p, u, "avatar-md")}
      <div><strong>${esc((p && p.displayName) || u.displayName || "")}</strong>
      <span class="muted small">${esc(t("settings.signedInAs", { email: u.email }))}</span></div>
    </div>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap">
      <a class="btn btn-red btn-sm" href="profile.html">${esc(t("settings.editProfile"))}</a>
      <button type="button" class="btn btn-ghost btn-sm" id="s-signout">${esc(t("nav.signout"))}</button>
    </div>`;
  box.querySelector("#s-signout").addEventListener("click", doSignOut);
}

renderLang();
window.addEventListener("langchange", () => { renderLang(); renderAccount(); });
onUser(u => { currentUser = u; renderAccount(); });
