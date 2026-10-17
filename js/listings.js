// Ready-made website listings: shared by the home page, shop page and admin.
import { SITE, t, esc, db, fb, isConfigured } from "./app.js";
import { getLang, money, applyTranslations } from "./i18n.js";

export const titleOf = l => (getLang() === "es" && l.titleEs) ? l.titleEs : (l.titleEn || l.titleEs || "");
export const descOf = l => (getLang() === "es" && l.descEs) ? l.descEs : (l.descEn || l.descEs || "");
export const createdSec = l => (l.createdAt && l.createdAt.seconds) || 0;
export const safeUrl = u => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

// Remember the last list for this visit so the page shows instantly next time
const CACHE_KEY = "listings.cache.v1";
export function cachedListings() {
  try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); return Array.isArray(c) ? c : null; } catch { return null; }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);

export async function fetchPublicListings() {
  if (!isConfigured) return [];
  const snap = await withTimeout(fb.getDocs(fb.query(fb.collection(db, "listings"), fb.where("status", "in", ["available", "sold"]))), 12000);
  const list = snap.docs.map(d => {
    const x = d.data();
    return { id: d.id, ...x, createdAt: { seconds: (x.createdAt && x.createdAt.seconds) || 0 } };
  }).sort((a, b) => createdSec(b) - createdSec(a));
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {}
  return list;
}

export async function fetchListingImages(listingId) {
  const snap = await fb.getDocs(fb.query(fb.collection(db, "listingImages"), fb.where("listingId", "==", listingId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
}

const statusText = s => t(`shop.${s === "hidden" ? "hidden" : s}`);

export function cardHTML(l, i = 0) {
  const title = titleOf(l);
  const url = safeUrl(l.url);
  const sold = l.status === "sold";
  return `<article class="card spot listing-card reveal${sold ? " listing-sold" : ""}" style="--d:${(i % 6) * 80}ms" data-id="${esc(l.id)}">
    <button type="button" class="listing-thumb" data-open="${esc(l.id)}" aria-label="${esc(t("shop.details"))}: ${esc(title)}">
      ${l.thumb ? `<img src="${esc(l.thumb)}" alt="" loading="lazy">` : `<span class="no-img">&lt;/&gt;</span>`}
      ${l.status !== "available" ? `<span class="listing-status ${sold ? "sold" : "hidden-st"}">${esc(statusText(l.status))}</span>` : ""}
    </button>
    <div class="listing-body">
      <span class="chip-tag">${esc(t(`type.${l.category || "other"}`))}</span>
      <h3>${esc(title)}</h3>
      <p class="muted clamp-2">${esc(descOf(l))}</p>
      <div class="listing-foot">
        <strong class="price">${esc(money(l.price || 0))}</strong>
        <div class="btns">
          ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("shop.viewLive"))} ↗</a>` : ""}
          <button type="button" class="btn btn-red btn-sm" data-open="${esc(l.id)}">${esc(t("shop.details"))}</button>
        </div>
      </div>
    </div>
  </article>`;
}

// ---------- details modal with picture gallery ----------
let modal, current = null, images = [], idx = 0, lastFocus = null;

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-panel">
      <button type="button" class="modal-close" data-close data-i18n-aria="shop.close">✕</button>
      <div class="listing-modal">
        <div class="gallery">
          <div class="gallery-main">
            <img id="gal-img" alt="">
            <button type="button" class="gal-nav gal-prev" data-i18n-aria="shop.prev">‹</button>
            <button type="button" class="gal-nav gal-next" data-i18n-aria="shop.next">›</button>
          </div>
          <div class="gal-thumbs" id="gal-thumbs"></div>
        </div>
        <div class="modal-info" id="modal-info"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeListing));
  modal.querySelector(".gal-prev").addEventListener("click", () => show(idx - 1));
  modal.querySelector(".gal-next").addEventListener("click", () => show(idx + 1));
  document.addEventListener("keydown", e => {
    if (modal.hidden) return;
    if (e.key === "Escape") closeListing();
    if (e.key === "ArrowLeft") show(idx - 1);
    if (e.key === "ArrowRight") show(idx + 1);
  });
  window.addEventListener("langchange", () => { if (!modal.hidden && current) renderInfo(); });
  return modal;
}

function show(i) {
  if (!images.length) return;
  idx = (i + images.length) % images.length;
  const img = modal.querySelector("#gal-img");
  img.src = images[idx];
  img.alt = titleOf(current);
  img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
  modal.querySelectorAll("#gal-thumbs button").forEach((b, n) => b.classList.toggle("active", n === idx));
  const multi = images.length > 1;
  modal.querySelectorAll(".gal-nav").forEach(b => { b.hidden = !multi; });
  modal.querySelector("#gal-thumbs").hidden = !multi;
}

function renderThumbs() {
  const box = modal.querySelector("#gal-thumbs");
  box.innerHTML = images.map((src, n) => `<button type="button" data-n="${n}" aria-label="${n + 1}"><img src="${esc(src)}" alt=""></button>`).join("");
  box.querySelectorAll("[data-n]").forEach(b => b.addEventListener("click", () => show(+b.dataset.n)));
}

function renderInfo() {
  const l = current;
  const url = safeUrl(l.url);
  const info = modal.querySelector("#modal-info");
  info.innerHTML = `
    <span class="chip-tag">${esc(t(`type.${l.category || "other"}`))}</span>
    <h2>${esc(titleOf(l))}</h2>
    <div><span class="badge badge-${esc(l.status)}">${esc(statusText(l.status))}</span></div>
    <div class="price">${esc(money(l.price || 0))} <small class="muted" style="font-size:.9rem">${esc(SITE.currency)}</small></div>
    <p class="desc">${esc(descOf(l))}</p>
    <div class="btns">
      ${l.status !== "sold" ? `<a class="btn btn-red" href="custom.html?listing=${encodeURIComponent(l.id)}">${esc(t("shop.want"))} <span class="arrow">→</span></a>` : ""}
      ${url ? `<a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("shop.viewLive"))} ↗</a>` : ""}
    </div>`;
  applyTranslations(modal);
}

export async function openListing(l) {
  ensureModal();
  current = l;
  lastFocus = document.activeElement;
  images = l.thumb ? [l.thumb] : [];
  idx = 0;
  renderInfo();
  renderThumbs();
  show(0);
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  modal.querySelector(".modal-close").focus();
  try {
    const full = await fetchListingImages(l.id);
    if (current !== l || !full.length) return;
    images = full.map(x => x.data);
    renderThumbs();
    show(0);
  } catch (e) { console.warn(e); }
}

export function closeListing() {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = "";
  current = null;
  lastFocus?.focus?.();
}

// Wire "Details" buttons inside a container
export function wireCards(root, list) {
  root.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    const l = list.find(x => x.id === b.dataset.open);
    if (l) openListing(l);
  }));
}
