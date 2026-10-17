import { t, esc, db, fb, onUser, getUser, getProfile, setProfile, toast, avatarHTML, gateHTML, wireGate } from "./app.js";
import { applyTranslations, fmtDay, fmtDate, fmtTime } from "./i18n.js";

const $ = id => document.getElementById(id);
const BANNERS = ["red", "crimson", "ember", "carbon"];

let draft = { photo: "", banner: "red" };
let bookings = [];
let requests = [];
let saving = false;

// ---------- photo: crop to square + shrink so it fits in the database ----------
async function fileToAvatar(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("bad-image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- preview ----------
function previewProfile() {
  return { ...(getProfile() || {}), photo: draft.photo, banner: draft.banner, displayName: $("p-name").value.trim() || (getProfile() || {}).displayName };
}

function renderPreview() {
  const u = getUser(); const p = previewProfile();
  $("p-avatar").innerHTML = avatarHTML(p, u);
  $("p-avatar-xl").innerHTML = avatarHTML(p, u, "avatar-xl");
  $("p-hero-name").textContent = p.displayName || u.displayName || u.email;
  $("p-hero-email").textContent = u.email;
  $("p-banner").className = `profile-banner banner-${BANNERS.includes(draft.banner) ? draft.banner : "red"}`;
  document.querySelectorAll("[data-banner]").forEach(b => {
    b.classList.toggle("selected", b.dataset.banner === draft.banner);
    b.setAttribute("aria-pressed", b.dataset.banner === draft.banner ? "true" : "false");
  });
  const since = (getProfile() || {}).createdAt || (u.metadata && u.metadata.creationTime);
  $("p-since").textContent = since ? t("profile.memberSince", { date: fmtDate(since, { month: "long", year: "numeric" }) }) : "";
  $("p-google").hidden = !((getProfile() || {}).googlePhoto || u.photoURL);
}

function renderSave() {
  const btn = $("p-save");
  btn.innerHTML = saving ? `<span class="spinner"></span> ${esc(t("profile.saving"))}` : esc(t("profile.save"));
  btn.disabled = saving;
}

// ---------- lists ----------
function badge(status) {
  return `<span class="badge badge-${esc(status)}">${esc(t(`status.${status}`))}</span>`;
}

function renderBookings() {
  const box = $("p-bookings");
  if (!bookings.length) {
    box.innerHTML = `<div class="list-empty">${esc(t("profile.noBookings"))}<br><a class="btn btn-red btn-sm" href="book.html">${esc(t("profile.bookNow"))}</a></div>`;
    return;
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  box.innerHTML = bookings.map(b => {
    const canCancel = ["pending", "confirmed"].includes(b.status) && b.date >= todayKey;
    return `<div class="list-item">
      <div class="list-item-top"><strong>${esc(t(`pkg.${b.packageId}.name`))}</strong>${badge(b.status)}</div>
      <span class="meta">${esc(fmtDay(b.date))} · ${esc(fmtTime(b.time))}</span>
      ${canCancel ? `<div><button type="button" class="btn btn-danger btn-sm" data-cancel="${esc(b.id)}">${esc(t("profile.cancel"))}</button></div>` : ""}
    </div>`;
  }).join("");
  box.querySelectorAll("[data-cancel]").forEach(btn => btn.addEventListener("click", () => cancelBooking(btn.dataset.cancel)));
}

function renderRequests() {
  const box = $("p-requests");
  if (!requests.length) {
    box.innerHTML = `<div class="list-empty">${esc(t("profile.noRequests"))}<br><a class="btn btn-red btn-sm" href="custom.html">${esc(t("profile.requestNow"))}</a></div>`;
    return;
  }
  box.innerHTML = requests.map(r => `<div class="list-item">
      <div class="list-item-top"><strong>${esc(t(`type.${r.type}`))}</strong>${badge(r.status)}</div>
      <span class="meta">${esc(r.business || "")}${r.business ? " · " : ""}${esc(t(`budget.${r.budget}`))}</span>
      <span class="meta small">${esc(fmtDate(r.createdAt))}</span>
    </div>`).join("");
}

async function loadLists(uid) {
  $("p-bookings").innerHTML = `<div class="loading">${esc(t("common.loading"))}</div>`;
  $("p-requests").innerHTML = `<div class="loading">${esc(t("common.loading"))}</div>`;
  try {
    const [bs, rs] = await Promise.all([
      fb.getDocs(fb.query(fb.collection(db, "bookings"), fb.where("uid", "==", uid))),
      fb.getDocs(fb.query(fb.collection(db, "requests"), fb.where("uid", "==", uid)))
    ]);
    bookings = bs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    requests = rs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
  } catch (e) {
    console.warn(e);
    toast(t("common.error"), "error");
  }
  renderBookings();
  renderRequests();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth" });
}

async function cancelBooking(id) {
  if (!window.confirm(t("profile.cancelConfirm"))) return;
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  try {
    const batch = fb.writeBatch(db);
    batch.update(fb.doc(db, "bookings", id), { status: "cancelled", updatedAt: fb.serverTimestamp() });
    if (b.slotId) batch.delete(fb.doc(db, "slots", b.slotId));
    await batch.commit();
    b.status = "cancelled";
    renderBookings();
    toast(t("profile.cancelled"));
  } catch (e) {
    console.warn(e);
    toast(t("common.error"), "error");
  }
}

// ---------- events ----------
$("p-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  try {
    draft.photo = await fileToAvatar(file);
    renderPreview();
  } catch {
    toast(t("profile.photoBad"), "error");
  }
});
$("p-google").addEventListener("click", () => { draft.photo = ""; renderPreview(); });
$("p-remove").addEventListener("click", () => { draft.photo = "none"; renderPreview(); });
document.querySelectorAll("[data-banner]").forEach(b => b.addEventListener("click", () => { draft.banner = b.dataset.banner; renderPreview(); }));
$("p-name").addEventListener("input", renderPreview);

$("profile-form").addEventListener("submit", async e => {
  e.preventDefault();
  const u = getUser();
  if (!u || saving) return;
  const patch = {
    displayName: $("p-name").value.trim().slice(0, 80),
    phone: $("p-phone").value.trim().slice(0, 30),
    company: $("p-company").value.trim().slice(0, 100),
    bio: $("p-bio").value.trim().slice(0, 500),
    photo: draft.photo,
    banner: draft.banner,
    updatedAt: fb.serverTimestamp()
  };
  saving = true; renderSave();
  try {
    await fb.updateDoc(fb.doc(db, "users", u.uid), patch);
    setProfile({ ...patch, updatedAt: new Date() });
    renderPreview();
    toast(t("profile.saved"));
  } catch (err) {
    console.warn(err);
    toast(t("common.error"), "error");
  } finally {
    saving = false; renderSave();
  }
});

window.addEventListener("langchange", () => {
  if (!getUser()) return;
  renderPreview(); renderSave(); renderBookings(); renderRequests();
});

// ---------- start ----------
let loadedFor = null;
onUser((u, p) => {
  $("p-loading").hidden = true;
  if (!u) {
    $("profile-wrap").hidden = true;
    $("gate").hidden = false;
    $("gate").innerHTML = gateHTML();
    wireGate($("gate"));
    return;
  }
  $("gate").hidden = true;
  $("profile-wrap").hidden = false;
  if (loadedFor === u.uid) return;
  loadedFor = u.uid;
  p = p || {};
  draft = { photo: p.photo || "", banner: BANNERS.includes(p.banner) ? p.banner : "red" };
  $("p-name").value = p.displayName || u.displayName || "";
  $("p-phone").value = p.phone || "";
  $("p-company").value = p.company || "";
  $("p-bio").value = p.bio || "";
  $("p-email").value = u.email || "";
  applyTranslations($("profile-wrap"));
  renderPreview();
  renderSave();
  loadLists(u.uid);
});
