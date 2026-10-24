import { SITE, t, esc, db, fb, onUser, isAdmin, toast, imageToDataURL, withTimeout } from "./app.js";
import { applyTranslations, money, fmtDay, fmtDate, fmtTime } from "./i18n.js";
import { titleOf, createdSec, fetchListingImages, safeUrl, deleteListing, invalidateListingsCache } from "./listings.js";

const $ = id => document.getElementById(id);
window.__ADMIN_V = 8; // tells admin.html this file is up to date
const STATUSES = {
  listings: ["available", "sold", "hidden"],
  bookings: ["pending", "confirmed", "completed", "cancelled"],
  requests: ["pending", "reviewing", "quoted", "in_progress", "completed", "cancelled"]
};
const statusLabel = (tab, s) => t(tab === "listings" ? `shop.${s}` : `status.${s}`);
const MAX_IMAGES = 6;
const MAX_IMG_CHARS = 380000; // small pictures = fast uploads and fast pages

const state = { tab: "listings", filter: "", data: { listings: [], bookings: [], requests: [] } };

function row(label, value, wide = false) {
  if (!value) return "";
  return `<div${wide ? ' class="wide"' : ""}><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
}

function contact(item) {
  const phoneDigits = String(item.phone || "").replace(/\D/g, "");
  const email = item.email || item.accountEmail;
  return `<div class="admin-client">
    <div>
      <strong>${esc(item.name || "")}</strong><br>
      ${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ""}
      ${item.phone ? ` · <a href="https://wa.me/${esc(phoneDigits)}" target="_blank" rel="noopener">${esc(item.phone)}</a>` : ""}
    </div>
  </div>`;
}

function statusSelect(item) {
  return `<select data-status="${esc(item.id)}" data-i18n-aria="admin.status">
    ${STATUSES[state.tab].map(s => `<option value="${s}"${item.status === s ? " selected" : ""}>${esc(statusLabel(state.tab, s))}</option>`).join("")}
  </select>`;
}

const received = item => `<span class="hint">${esc(t("admin.received", { date: fmtDate(item.createdAt || new Date(), { dateStyle: "medium", timeStyle: "short" }) }))}</span>`;

function listingCard(l) {
  const url = safeUrl(l.url);
  return `<article class="card spot admin-listing">
    <div class="thumb">${l.thumb ? `<img src="${esc(l.thumb)}" alt="" loading="lazy">` : `<span class="no-img">&lt;/&gt;</span>`}</div>
    <div>
      <span class="chip-tag">${esc(t(`type.${l.category || "other"}`))}</span>
      <h3>${esc(titleOf(l))}</h3>
      <p class="muted" style="margin:0"><strong style="color:var(--text)">${esc(money(l.price || 0))}</strong>
        ${url ? ` · <a class="text-red" href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ""))}</a>` : ""}</p>
      ${received(l)}
    </div>
    <div class="actions admin-side">
      <span class="badge badge-${esc(l.status)}">${esc(statusLabel("listings", l.status))}</span>
      ${statusSelect(l)}
      <button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(l.id)}">✎ ${esc(t("lst.edit"))}</button>
      <button type="button" class="btn btn-danger btn-sm" data-del-listing="${esc(l.id)}">${esc(t("admin.delete"))}</button>
    </div>
  </article>`;
}

function bookingCard(b) {
  return `<article class="card admin-item">
    <div>
      <h3>${esc(t(`pkg.${b.packageId}.name`))} · ${esc(money(b.price || 0))}</h3>
      <p class="muted">${esc(fmtDay(b.date))} · ${esc(fmtTime(b.time))}</p>
      ${contact(b)}
      <dl class="admin-details">
        ${row(t("admin.lang"), esc(t(`lang.${b.lang}`)))}
        ${row(t("admin.notes"), esc(b.notes), true)}
      </dl>
    </div>
    <div class="admin-side">
      <span class="badge badge-${esc(b.status)}">${esc(t(`status.${b.status}`))}</span>
      ${statusSelect(b)}
      ${received(b)}
      <button type="button" class="btn btn-danger btn-sm" data-delete="${esc(b.id)}">${esc(t("admin.delete"))}</button>
    </div>
  </article>`;
}

function requestCard(r) {
  const links = String(r.links || "").split(/\s+/).filter(Boolean)
    .map(l => /^https?:\/\//i.test(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>` : esc(l)).join("<br>");
  const listing = r.listingId ? state.data.listings.find(l => l.id === r.listingId) : null;
  const listingName = listing ? titleOf(listing) : r.listingTitle;
  return `<article class="card admin-item">
    <div>
      <h3>${esc(t(`type.${r.type}`))}${r.business ? ` · ${esc(r.business)}` : ""}</h3>
      ${contact(r)}
      <dl class="admin-details">
        ${row(t("admin.listingRequest"), listingName ? `<a class="text-red" href="shop.html?id=${encodeURIComponent(r.listingId)}">${esc(listingName)}</a>` : "", true)}
        ${row(t("admin.budget"), esc(t(`budget.${r.budget}`)))}
        ${row(t("admin.pages"), r.pages ? esc(t(`pages.${r.pages}`)) : "")}
        ${row(t("admin.deadline"), r.deadline ? esc(fmtDay(r.deadline, { day: "numeric", month: "long", year: "numeric" })) : "")}
        ${row(t("admin.lang"), esc(t(`lang.${r.lang}`)))}
        ${row(t("admin.features"), (r.features || []).map(f => esc(t(`feat.${f}`))).join(", "), true)}
        ${row(t("admin.description"), esc(r.description), true)}
        ${row(t("admin.links"), links, true)}
      </dl>
    </div>
    <div class="admin-side">
      <span class="badge badge-${esc(r.status)}">${esc(t(`status.${r.status}`))}</span>
      ${statusSelect(r)}
      ${received(r)}
      <button type="button" class="btn btn-danger btn-sm" data-delete="${esc(r.id)}">${esc(t("admin.delete"))}</button>
    </div>
  </article>`;
}

function renderFilter() {
  const sel = $("a-filter");
  sel.innerHTML = `<option value="">${esc(t("admin.all"))}</option>` +
    STATUSES[state.tab].map(s => `<option value="${s}">${esc(statusLabel(state.tab, s))}</option>`).join("");
  sel.value = STATUSES[state.tab].includes(state.filter) ? state.filter : "";
}

function render() {
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === state.tab);
    b.setAttribute("aria-selected", b.dataset.tab === state.tab ? "true" : "false");
  });
  ["listings", "bookings", "requests"].forEach(k => { $(`count-${k}`).textContent = state.data[k].length; });
  $("a-new").hidden = state.tab !== "listings";
  renderFilter();
  const items = state.data[state.tab].filter(i => !state.filter || i.status === state.filter);
  const list = $("a-list");
  if (!items.length) {
    list.innerHTML = `<div class="list-empty">${esc(t("admin.empty"))}${state.tab === "listings" ? `<br><button type="button" class="btn btn-red btn-sm" data-new>+ ${esc(t("admin.newListing"))}</button>` : ""}</div>`;
    list.querySelector("[data-new]")?.addEventListener("click", () => openEditor(null));
    return;
  }
  const card = { listings: listingCard, bookings: bookingCard, requests: requestCard }[state.tab];
  list.innerHTML = items.map(card).join("");
  applyTranslations(list);
  list.querySelectorAll("[data-status]").forEach(s => s.addEventListener("change", () => updateStatus(s.dataset.status, s.value)));
  list.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => removeItem(b.dataset.delete)));
  list.querySelectorAll("[data-del-listing]").forEach(b => b.addEventListener("click", () => removeListing(b.dataset.delListing)));
  list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openEditor(state.data.listings.find(l => l.id === b.dataset.edit))));
}

async function load() {
  $("a-list").innerHTML = `<div class="loading">${esc(t("common.loading"))}</div>`;
  const get = async (col, ordered) => {
    try {
      const q = ordered ? fb.query(fb.collection(db, col), fb.orderBy("createdAt", "desc")) : fb.collection(db, col);
      const snap = await withTimeout(fb.getDocs(q), 12000);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.warn(col, e); toast(saveErrorText(e), "error"); return []; }
  };
  checkSetup();
  const [listings, bookings, requests] = await Promise.all([get("listings", false), get("bookings", true), get("requests", true)]);
  state.data = { listings: listings.sort((a, b) => createdSec(b) - createdSec(a)), bookings, requests };
  render();
}

// Make sure the database lets this account save listings (rules published + owner account)
async function checkSetup() {
  const box = $("a-warn");
  if (!box) return;
  try {
    // only the owner may read hidden listings, so this fails if the rules or the account are wrong
    await withTimeout(fb.getDocs(fb.query(fb.collection(db, "listings"), fb.where("status", "==", "hidden"))), 12000);
    box.hidden = true;
  } catch (e) {
    if (e && e.code === "timeout") return;
    box.innerHTML = `<strong>${esc(t("admin.setupTitle"))}</strong><span>${esc(t("admin.setupBody"))}</span><code>${esc((e && e.code) || "error")}</code>`;
    box.hidden = false;
  }
}

async function updateStatus(id, status) {
  const col = state.tab;
  const item = state.data[col].find(i => i.id === id);
  if (!item) return;
  try {
    const batch = fb.writeBatch(db);
    batch.update(fb.doc(db, col, id), { status, updatedAt: fb.serverTimestamp() });
    // Cancelling a booking frees its time so someone else can book it
    if (col === "bookings" && status === "cancelled" && item.slotId) batch.delete(fb.doc(db, "slots", item.slotId));
    await batch.commit();
    item.status = status;
    render();
    toast(t("admin.updated"));
  } catch (e) {
    console.warn(e);
    toast(saveErrorText(e), "error");
    render();
  }
}

async function removeItem(id) {
  if (!window.confirm(t("admin.deleteConfirm"))) return;
  const col = state.tab;
  const item = state.data[col].find(i => i.id === id);
  try {
    const batch = fb.writeBatch(db);
    batch.delete(fb.doc(db, col, id));
    if (col === "bookings" && item && item.slotId && item.status !== "cancelled") batch.delete(fb.doc(db, "slots", item.slotId));
    await batch.commit();
    state.data[col] = state.data[col].filter(i => i.id !== id);
    render();
    toast(t("admin.deleted"));
  } catch (e) {
    console.warn(e);
    toast(t("common.error"), "error");
  }
}

/* =========================================================
   Listing editor (add / edit websites for sale)
   ========================================================= */
let ed = null; // { id, images: [{id, data}], removed: [], busy }

function renderEdImages() {
  const box = $("ed-images");
  box.innerHTML = ed.images.map((im, i) => `
    <div class="img-tile">
      <img src="${esc(im.data)}" alt="">
      ${i === 0 ? `<span class="cover-tag">${esc(t("lst.cover"))}</span>` : ""}
      <div class="tile-actions">
        ${i > 0 ? `<button type="button" data-left="${i}" aria-label="${esc(t("lst.moveLeft"))}" title="${esc(t("lst.moveLeft"))}">←</button>` : ""}
        <button type="button" data-rm="${i}" aria-label="${esc(t("lst.remove"))}" title="${esc(t("lst.remove"))}">✕</button>
      </div>
    </div>`).join("") +
    (ed.images.length < MAX_IMAGES ? `<button type="button" class="img-add" id="ed-add">${ed.processing ? `<span class="spinner"></span>` : `+ ${esc(t("lst.addImages"))}`}</button>` : "");
  box.querySelector("#ed-add")?.addEventListener("click", () => $("ed-file").click());
  box.querySelectorAll("[data-left]").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.left;
    [ed.images[i - 1], ed.images[i]] = [ed.images[i], ed.images[i - 1]];
    renderEdImages();
  }));
  box.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
    const [im] = ed.images.splice(+b.dataset.rm, 1);
    if (im.id) ed.removed.push(im.id);
    renderEdImages();
  }));
}

function renderEdSave() {
  const btn = $("ed-save");
  btn.innerHTML = ed && ed.busy ? `<span class="spinner"></span> ${esc(t("lst.saving"))}` : esc(t("lst.save"));
  btn.disabled = !!(ed && (ed.busy || ed.processing));
}

function fillCategories(selected) {
  $("ed-category").innerHTML = SITE.listingCategories.map(c => `<option value="${c}"${c === selected ? " selected" : ""}>${esc(t(`type.${c}`))}</option>`).join("");
}

async function openEditor(listing) {
  ed = { id: listing ? listing.id : null, images: [], removed: [], busy: false, processing: false };
  $("ed-title").textContent = t(listing ? "lst.editTitle" : "lst.newTitle");
  $("ed-delete").hidden = !listing;
  $("ed-cur").textContent = SITE.currency;
  $("ed-titleEn").value = listing?.titleEn || "";
  $("ed-titleEs").value = listing?.titleEs || "";
  $("ed-descEn").value = listing?.descEn || "";
  $("ed-descEs").value = listing?.descEs || "";
  $("ed-price").value = listing ? (listing.price ?? "") : "";
  $("ed-url").value = listing?.url || "";
  $("ed-status").value = listing?.status || "available";
  fillCategories(listing?.category || SITE.listingCategories[0]);
  applyTranslations($("editor"));
  $("editor").hidden = false;
  document.body.style.overflow = "hidden";
  renderEdSave();
  if (listing) {
    ed.processing = true;
    renderEdImages();
    try {
      const imgs = await fetchListingImages(listing.id);
      ed.images = imgs.map(x => ({ id: x.id, data: x.data }));
      if (!ed.images.length && listing.thumb) ed.images = [{ id: null, data: listing.thumb }];
    } catch (e) { console.warn(e); toast(t("common.error"), "error"); }
    ed.processing = false;
    renderEdSave();
  }
  renderEdImages();
  setTimeout(() => $("ed-titleEn").focus(), 60);
}

function closeEditor() {
  if (ed && ed.busy) return;
  $("editor").hidden = true;
  document.body.style.overflow = "";
  ed = null;
}

$("ed-file").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!ed || !files.length) return;
  if (ed.images.length + files.length > MAX_IMAGES) toast(t("lst.tooMany"), "error");
  ed.processing = true; renderEdImages(); renderEdSave();
  for (const f of files.slice(0, MAX_IMAGES - ed.images.length)) {
    try {
      let data = await imageToDataURL(f, 1280, 0.76);
      if (data.length > MAX_IMG_CHARS) data = await imageToDataURL(f, 1050, 0.68);
      if (data.length > MAX_IMG_CHARS) data = await imageToDataURL(f, 860, 0.6);
      if (data.length > MAX_IMG_CHARS) data = await imageToDataURL(f, 700, 0.55);
      ed.images.push({ id: null, data });
    } catch { toast(t("profile.photoBad"), "error"); }
  }
  ed.processing = false; renderEdImages(); renderEdSave();
});

async function makeThumb(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return imageToDataURL(new File([blob], "x.jpg", { type: blob.type || "image/jpeg" }), 560, 0.7);
}

// Turn a database error into a clear message
function saveErrorText(err) {
  const code = (err && err.code) || "";
  const msg = String((err && err.message) || "");
  if (code === "permission-denied" || /permission/i.test(msg)) return t("lst.errPerm");
  if (code === "timeout") return t("common.dbSlow");
  if (code === "invalid-argument" || /exceeds|too large|maximum/i.test(msg)) return t("lst.errBig");
  return `${t("common.error")} (${code || msg.slice(0, 60) || "?"})`;
}

$("ed-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!ed || ed.busy || ed.processing) return;
  const titleEn = $("ed-titleEn").value.trim();
  const titleEs = $("ed-titleEs").value.trim();
  const price = Number($("ed-price").value);
  if (!(titleEn || titleEs) || !($("ed-price").value !== "" && price >= 0) || !ed.images.length) {
    toast(t("lst.required"), "error");
    return;
  }
  ed.busy = true; renderEdSave();
  try {
    const isNew = !ed.id;
    const ref = isNew ? fb.doc(fb.collection(db, "listings")) : fb.doc(db, "listings", ed.id);
    // give every new picture its own id first
    ed.images.forEach(im => { if (!im.id) { im.ref = fb.doc(fb.collection(db, "listingImages")); im.newId = im.ref.id; } });
    const imageIds = ed.images.map(im => im.id || im.newId);
    const data = {
      titleEn, titleEs,
      descEn: $("ed-descEn").value.trim(),
      descEs: $("ed-descEs").value.trim(),
      price: Math.round(price),
      currency: SITE.currency,
      category: $("ed-category").value,
      url: safeUrl($("ed-url").value),
      status: $("ed-status").value,
      thumb: await makeThumb(ed.images[0].data),
      imageIds,
      updatedAt: fb.serverTimestamp()
    };
    if (isNew) data.createdAt = fb.serverTimestamp();

    // 1) the listing itself (small, so it saves fast)
    await withTimeout(fb.setDoc(ref, data, { merge: true }), 30000);
    // 2) the pictures, all at the same time
    await withTimeout(Promise.all(ed.images.map((im, i) => im.id
      ? fb.updateDoc(fb.doc(db, "listingImages", im.id), { order: i })
      : fb.setDoc(im.ref, { listingId: ref.id, data: im.data, order: i, createdAt: fb.serverTimestamp() }))), 90000);
    // 3) pictures you removed
    if (ed.removed.length) await withTimeout(Promise.all(ed.removed.map(id => fb.deleteDoc(fb.doc(db, "listingImages", id)))), 30000);

    ed.images.forEach(im => { if (!im.id) { im.id = im.newId; delete im.ref; } });
    ed.removed = [];
    invalidateListingsCache();
    const local = { ...data, id: ref.id, updatedAt: new Date() };
    const i = state.data.listings.findIndex(l => l.id === ref.id);
    if (i >= 0) state.data.listings[i] = { ...state.data.listings[i], ...local };
    else state.data.listings.unshift({ ...local, createdAt: { seconds: Date.now() / 1000 } });
    ed.busy = false;
    closeEditor();
    state.tab = "listings";
    render();
    toast(t("lst.saved"));
  } catch (err) {
    console.warn("Listing save failed:", err);
    toast(saveErrorText(err), "error");
    if (ed) { ed.busy = false; renderEdSave(); }
  }
});

async function removeListing(id) {
  if (!window.confirm(t("lst.deleteConfirm"))) return false;
  try {
    await deleteListing(id);
    state.data.listings = state.data.listings.filter(l => l.id !== id);
    render();
    toast(t("lst.deleted"));
    return true;
  } catch (err) {
    console.warn(err);
    toast(saveErrorText(err), "error");
    return false;
  }
}

$("ed-delete").addEventListener("click", async () => {
  if (!ed || !ed.id || ed.busy) return;
  const id = ed.id;
  ed.busy = true; renderEdSave();
  const ok = await removeListing(id);
  if (ed) { ed.busy = false; renderEdSave(); }
  if (ok) closeEditor();
});

document.querySelectorAll("[data-ed-close]").forEach(b => b.addEventListener("click", closeEditor));
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("editor").hidden) closeEditor(); });

/* ========================================================= */
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { state.tab = b.dataset.tab; state.filter = ""; render(); }));
$("a-filter").addEventListener("change", e => { state.filter = e.target.value; render(); });
$("a-refresh").addEventListener("click", load);
$("a-new").addEventListener("click", () => openEditor(null));

let loaded = false;
onUser(u => {
  $("a-loading").hidden = true;
  const ok = !!u && isAdmin(u);
  $("a-denied").hidden = ok;
  $("a-panel").hidden = !ok;
  if (ok && !loaded) {
    loaded = true;
    // admin.html?edit=ID opens that listing straight away (from the shop's Edit button)
    const editId = new URLSearchParams(location.search).get("edit");
    load().then(() => {
      if (!editId) return;
      history.replaceState(null, "", "admin.html");
      const l = state.data.listings.find(x => x.id === editId);
      if (l) openEditor(l);
    });
  }
});

window.addEventListener("langchange", () => {
  if (!$("a-panel").hidden) render();
  if (ed && !$("editor").hidden) {
    $("ed-title").textContent = t(ed.id ? "lst.editTitle" : "lst.newTitle");
    fillCategories($("ed-category").value);
    renderEdImages(); renderEdSave();
  }
});
