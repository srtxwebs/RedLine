import { SITE, t, esc, onUser, getProfile, toast, avatarHTML, gateHTML, wireGate, doSignOut, displayNameOf,
  getPref, setPref, resetPrefs, glitchEl, screenGlitch } from "./app.js";
import { getLang, setLang, LANGS, applyTranslations } from "./i18n.js";

const $ = id => document.getElementById(id);

/* ---------- language cards ---------- */
function renderLangs() {
  const grid = $("lang-grid");
  grid.innerHTML = LANGS.map((l, i) => `
    <button type="button" class="lang-card${l === getLang() ? " active" : ""}" data-lang-card="${l}" aria-pressed="${l === getLang()}" style="--d:${i * 60}ms">
      <span class="lang-code" data-text="${l.toUpperCase()}">${l.toUpperCase()}</span>
      <span class="lang-names">
        <strong>${esc(t(`lang.${l}`))}</strong>
        <span class="muted small">${esc(t(`langName.${l}`))}</span>
      </span>
      <span class="lang-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></span>
    </button>`).join("");
  grid.querySelectorAll("[data-lang-card]").forEach(c => c.addEventListener("click", () => {
    if (c.dataset.langCard === getLang()) return;
    screenGlitch(1);
    setLang(c.dataset.langCard);
    toast(t("settings.langSaved"));
  }));
}

/* ---------- segmented controls ---------- */
function setSeg(el, attr, value) {
  const btns = [...el.querySelectorAll(`[data-${attr}]`)];
  const i = Math.max(0, btns.findIndex(b => b.dataset[attr] === value));
  btns.forEach((b, n) => { b.classList.toggle("active", n === i); b.setAttribute("aria-checked", n === i ? "true" : "false"); });
  el.style.setProperty("--pos", i);
  el.style.setProperty("--count", btns.length);
}

function renderPrefs() {
  const accent = getPref("accent");
  document.querySelectorAll("[data-accent]").forEach(b => {
    if (!b.classList.contains("accent-sw")) return;
    b.classList.toggle("active", b.dataset.accent === accent);
    b.setAttribute("aria-checked", b.dataset.accent === accent ? "true" : "false");
  });
  setSeg($("size-seg"), "size", getPref("size"));
  setSeg($("glitch-seg"), "glitch", getPref("glitch"));
  $("s-motion").checked = getPref("reduceMotion") === "1";
}

document.querySelectorAll(".accent-sw").forEach(b => b.addEventListener("click", () => {
  setPref("accent", b.dataset.accent);
  glitchEl($("gp-word"));
  toast(t("settings.saved"));
}));
$("size-seg").querySelectorAll("[data-size]").forEach(b => b.addEventListener("click", () => { setPref("size", b.dataset.size); toast(t("settings.saved")); }));
$("glitch-seg").querySelectorAll("[data-glitch]").forEach(b => b.addEventListener("click", () => {
  setPref("glitch", b.dataset.glitch);
  if (b.dataset.glitch !== "off") { screenGlitch(b.dataset.glitch === "high" ? 1 : .6); glitchEl($("gp-word")); }
  toast(t("settings.saved"));
}));
$("s-motion").addEventListener("change", e => { setPref("reduceMotion", e.target.checked ? "1" : "0"); toast(t("settings.saved")); });
$("s-reset").addEventListener("click", () => { resetPrefs(); screenGlitch(1); toast(t("settings.resetDone")); });
window.addEventListener("prefchange", renderPrefs);

/* ---------- live glitch preview ---------- */
const word = $("gp-word");
function renderPreviewWord() {
  word.textContent = SITE.brand;
  word.setAttribute("data-text", SITE.brand);
}
setInterval(() => {
  if (document.hidden) return;
  const lvl = document.documentElement.dataset.glitch;
  if (lvl === "off" || document.documentElement.classList.contains("reduce-motion")) return;
  if (lvl === "high" || Math.random() < .5) glitchEl(word, 380);
}, 1400);

/* ---------- side menu: highlight the section on screen ---------- */
const nav = $("set-nav");
const ind = nav.querySelector(".set-nav-ind");
const links = [...nav.querySelectorAll("a")];
function markActive(id) {
  links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${id}`));
  const a = links.find(x => x.classList.contains("active"));
  if (a) { ind.style.transform = `translateY(${a.offsetTop}px)`; ind.style.height = `${a.offsetHeight}px`; }
}
links.forEach(a => a.addEventListener("click", e => {
  e.preventDefault();
  const target = document.querySelector(a.getAttribute("href"));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  markActive(target.id);
  glitchEl(target.querySelector("h2"));
}));
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (vis) markActive(vis.target.id);
  }, { rootMargin: "-30% 0px -55% 0px" });
  document.querySelectorAll(".set-card").forEach(s => io.observe(s));
}

/* ---------- account ---------- */
let currentUser = null;
function renderAccount() {
  const box = $("s-account-body");
  const u = currentUser;
  if (!u) {
    box.innerHTML = gateHTML();
    box.querySelector(".gate").classList.add("in");
    box.querySelector(".gate").style.margin = "0";
    wireGate(box);
    return;
  }
  const p = getProfile();
  box.innerHTML = `
    <div class="acct">
      <div class="acct-id">
        ${avatarHTML(p, u, "avatar-lg")}
        <div><strong>${esc(displayNameOf(p, u))}</strong>
        <span class="muted small">${esc(t("settings.signedInAs", { email: u.email }))}</span></div>
      </div>
      <div class="acct-actions">
        <a class="btn btn-red btn-sm" href="profile.html">${esc(t("settings.editProfile"))} <span class="arrow">→</span></a>
        <button type="button" class="btn btn-ghost btn-sm" id="s-signout">${esc(t("nav.signout"))}</button>
      </div>
    </div>`;
  box.querySelector("#s-signout").addEventListener("click", doSignOut);
}

function renderAll() {
  renderLangs(); renderPrefs(); renderPreviewWord(); renderAccount();
  applyTranslations(document.querySelector(".settings-layout"));
}
renderAll();
requestAnimationFrame(() => markActive("s-language"));
window.addEventListener("langchange", () => { renderAll(); requestAnimationFrame(() => markActive(links.find(a => a.classList.contains("active"))?.getAttribute("href").slice(1) || "s-language")); });
onUser(u => { currentUser = u; renderAccount(); });
