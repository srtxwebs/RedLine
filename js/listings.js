// Ready-made website listings: shared by the home page, shop page and admin.
import { SITE, t, esc, db, fb, isConfigured, reduceMotion, isAdmin, toast } from "./app.js";
import { getLang, money, applyTranslations } from "./i18n.js";
import { rest } from "./firebase.js";

export const titleOf = l => (getLang() === "es" && l.titleEs) ? l.titleEs : (l.titleEn || l.titleEs || "");
export const descOf = l => (getLang() === "es" && l.descEs) ? l.descEs : (l.descEn || l.descEs || "");
export const createdSec = l => (l.createdAt && l.createdAt.seconds) || 0;
export const safeUrl = u => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

// Remember the last list on this device so the page shows instantly next time
const CACHE_KEY = "listings.cache.v2";
export function cachedListings() {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return Array.isArray(c) ? c : null; } catch { return null; }
}
export function invalidateListingsCache() {
  try { localStorage.removeItem(CACHE_KEY); sessionStorage.removeItem("listings.cache.v1"); } catch {}
}
let inflight = null;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);

export function fetchPublicListings() {
  if (!isConfigured) return Promise.resolve([]);
  // one request at a time, shared by everyone who asks
  if (!inflight) inflight = loadPublic().finally(() => { inflight = null; });
  return inflight;
}
async function loadPublic() {
  let rows;
  try {
    // one plain request: much faster than starting the live database connection
    rows = await rest.query("listings", "status", "IN", ["available", "sold"], 10000);
  } catch (e) {
    if (e.code !== "network" && e.code !== "timeout") throw e;
    const snap = await withTimeout(fb.getDocs(fb.query(fb.collection(db, "listings"), fb.where("status", "in", ["available", "sold"]))), 12000);
    rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const list = rows.map(x => ({ ...x, createdAt: { seconds: (x.createdAt && x.createdAt.seconds) || 0 } }))
    .sort((a, b) => createdSec(b) - createdSec(a));
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); }
  catch { try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.map(l => ({ ...l, thumb: "" })))); } catch {} }
  return list;
}

// Start downloading as soon as this file loads (before the page asks)
if (isConfigured && ["home", "shop"].includes(document.body?.dataset.page)) {
  fetchPublicListings().catch(() => {});
}

// Delete a listing and all its pictures (owner only)
export async function deleteListing(id) {
  const imgs = await rest.query("listingImages", "listingId", "EQUAL", id, 15000);
  await Promise.all(imgs.map(d => rest.del(`listingImages/${d.id}`)));
  await rest.del(`listings/${id}`);
  invalidateListingsCache();
}

export async function fetchListingImages(listingId) {
  let rows;
  try { rows = await rest.query("listingImages", "listingId", "EQUAL", listingId, 15000); }
  catch (e) {
    const snap = await fb.getDocs(fb.query(fb.collection(db, "listingImages"), fb.where("listingId", "==", listingId)));
    rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return rows.sort((a, b) => (a.order || 0) - (b.order || 0));
}

const statusText = s => t(`shop.${s === "hidden" ? "hidden" : s}`);

export function cardHTML(l, i = 0) {
  const title = titleOf(l);
  const url = safeUrl(l.url);
  const sold = l.status === "sold";
  return `<article class="card spot tilt listing-card reveal${sold ? " listing-sold" : ""}" style="--d:${(i % 6) * 80}ms;view-transition-name:lc-${esc(String(l.id).replace(/[^a-zA-Z0-9_-]/g, ""))}" data-id="${esc(l.id)}">
    <button type="button" class="listing-thumb" data-open="${esc(l.id)}" aria-label="${esc(t("shop.details"))}: ${esc(title)}">
      ${l.thumb ? `<img src="${esc(l.thumb)}" alt="" loading="lazy" decoding="async">` : `<span class="no-img">&lt;/&gt;</span>`}
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
      ${isAdmin() ? `<div class="owner-tools">
        <a class="btn btn-ghost btn-sm" href="admin.html?edit=${encodeURIComponent(l.id)}">✎ ${esc(t("lst.edit"))}</a>
        <button type="button" class="btn btn-danger btn-sm" data-del="${esc(l.id)}">${esc(t("lst.delete"))}</button>
      </div>` : ""}
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

export async function openListing(l, sourceImg = null) {
  ensureModal();
  current = l;
  lastFocus = document.activeElement;
  images = l.thumb ? [l.thumb] : [];
  idx = 0;
  const reveal = () => {
    renderInfo();
    renderThumbs();
    show(0);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };
  const galImg = modal.querySelector("#gal-img");
  if (sourceImg && document.startViewTransition && !reduceMotion()) {
    sourceImg.style.viewTransitionName = "listing-pic";
    modal.querySelector(".modal-panel").classList.add("no-pop");
    const vt = document.startViewTransition(() => {
      sourceImg.style.viewTransitionName = "";
      galImg.style.viewTransitionName = "listing-pic";
      reveal();
    });
    vt.finished.finally(() => { galImg.style.viewTransitionName = ""; modal.querySelector(".modal-panel").classList.remove("no-pop"); });
  } else {
    reveal();
  }
  modal.querySelector(".modal-close").focus({ preventScroll: true });
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
    const img = b.closest(".listing-card")?.querySelector(".listing-thumb img");
    if (l) openListing(l, img);
  }));
  root.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!window.confirm(t("lst.deleteConfirm"))) return;
    b.disabled = true;
    try {
      await deleteListing(b.dataset.del);
      const card = b.closest(".listing-card");
      card?.classList.add("removing");
      setTimeout(() => card?.remove(), 320);
      const i = list.findIndex(x => x.id === b.dataset.del);
      if (i >= 0) list.splice(i, 1);
      root.dispatchEvent(new CustomEvent("listingdeleted", { detail: b.dataset.del }));
      toast(t("lst.deleted"));
    } catch (err) {
      console.warn(err);
      b.disabled = false;
      toast(err && err.code === "permission-denied" ? t("lst.errPerm") : (err && (err.code === "network" || err.code === "timeout")) ? t("lst.errNet") : `${t("common.error")} (${(err && err.code) || "?"})`, "error");
    }
  }));
}
