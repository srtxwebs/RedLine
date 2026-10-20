import { t, esc, db, fb, onUser, getUser, getProfile, setProfile, toast, avatarHTML, avatarSrc, gateHTML, wireGate,
  withTimeout, imageToDataURL, displayNameOf, glitchEl, reduceMotion } from "./app.js";
import { applyTranslations, fmtDay, fmtDate, fmtTime } from "./i18n.js";

const $ = id => document.getElementById(id);
const BANNERS = ["red", "crimson", "ember", "carbon"];
const REQ_STEPS = ["pending", "reviewing", "quoted", "in_progress", "completed"];
const TABS = ["overview", "edit", "bookings", "requests"];

let draft = { photo: "", banner: "red" };
let bookings = [];
let requests = [];
let saving = false;
let tab = "overview";

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysUntil = ymd => {
  const [y, m, d] = ymd.split("-").map(Number);
  const a = new Date(y, m - 1, d); const b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
};
const toDate = v => (!v ? null : typeof v.toDate === "function" ? v.toDate() : typeof v.seconds === "number" ? new Date(v.seconds * 1000) : new Date(v));

/* ---------- tabs ---------- */
function moveTabInd() {
  const btn = $("pf-tabs").querySelector(`[data-tab="${tab}"]`);
  const ind = $("pf-tabs").querySelector(".pf-tab-ind");
  if (!btn) return;
  ind.style.width = `${btn.offsetWidth}px`;
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
}
function setTab(next, push = true) {
  if (!TABS.includes(next)) next = "overview";
  tab = next;
  $("pf-tabs").querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  });
  document.querySelectorAll(".pf-pane").forEach(p => {
    const on = p.dataset.pane === tab;
    p.hidden = !on;
    if (on) { p.classList.remove("pane-in"); void p.offsetWidth; p.classList.add("pane-in"); }
  });
  moveTabInd();
  if (push) history.replaceState(null, "", tab === "overview" ? location.pathname : `#${tab}`);
}
$("pf-tabs").querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
window.addEventListener("resize", moveTabInd);

/* ---------- header / preview ---------- */
function previewProfile() {
  return { ...(getProfile() || {}), photo: draft.photo, banner: draft.banner, displayName: $("p-name").value.trim() || (getProfile() || {}).displayName };
}

function renderHeader() {
  const u = getUser(); if (!u) return;
  const p = previewProfile();
  $("p-avatar").innerHTML = avatarHTML(p, u, "avatar-dz");
  $("p-avatar-xl").innerHTML = avatarHTML(p, u, "avatar-xxl");
  $("p-hero-name").textContent = displayNameOf(p, u);
  $("p-hero-name").setAttribute("data-text", displayNameOf(p, u));
  $("p-hero-email").textContent = u.email;
  $("p-banner").className = `pf-cover banner-${BANNERS.includes(draft.banner) ? draft.banner : "red"}`;
  document.querySelectorAll("[data-banner]").forEach(b => {
    b.classList.toggle("selected", b.dataset.banner === draft.banner);
    b.setAttribute("aria-pressed", b.dataset.banner === draft.banner ? "true" : "false");
  });
  const since = toDate((getProfile() || {}).createdAt) || (u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime) : null);
  $("p-since").textContent = since ? t("profile.memberSince", { date: fmtDate(since, { month: "long", year: "numeric" }) }) : "";
  $("p-cover-id").textContent = `UID::${u.uid.slice(0, 10).toUpperCase()} // ${(since || new Date()).getFullYear()}`;
  $("p-google").hidden = !((getProfile() || {}).googlePhoto || u.photoURL);
  renderStats(since);
  renderCompleteness();
}

// numbers count up
function countTo(el, value) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = value;
  if (reduceMotion() || from === value) { el.textContent = value; return; }
  const start = performance.now(), dur = 900;
  const step = now => {
    const k = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderStats(since) {
  const days = since ? Math.max(1, Math.floor((Date.now() - since.getTime()) / 86400000) + 1) : 1;
  countTo(document.querySelector('[data-stat="bookings"]'), bookings.length);
  countTo(document.querySelector('[data-stat="requests"]'), requests.length);
  countTo(document.querySelector('[data-stat="days"]'), days);
  document.querySelector('[data-count="bookings"]').textContent = bookings.length;
  document.querySelector('[data-count="requests"]').textContent = requests.length;
}

/* ---------- overview cards ---------- */
function renderCompleteness() {
  const u = getUser(); const p = previewProfile();
  const items = [
    ["profile.photo", !!avatarSrc(p, u)],
    ["profile.name", !!(p.displayName || "").trim()],
    ["profile.phone", !!$("p-phone").value.trim()],
    ["profile.company", !!$("p-company").value.trim()],
    ["profile.bio", !!$("p-bio").value.trim()]
  ];
  const done = items.filter(i => i[1]).length;
  const pct = Math.round((done / items.length) * 100);
  const circ = 2 * Math.PI * 50;
  const ring = $("p-ring");
  ring.style.strokeDasharray = `${circ}`;
  ring.style.strokeDashoffset = `${circ * (1 - pct / 100)}`;
  $("p-pct").textContent = `${pct}%`;
  $("p-complete-hint").textContent = t(pct === 100 ? "profile.completeDone" : "profile.completeHint");
  $("p-checklist").innerHTML = items.map(([k, ok]) => `<li class="${ok ? "ok" : ""}"><span class="ck" aria-hidden="true">${ok ? "✓" : ""}</span>${esc(t(k))}</li>`).join("");
  $("p-checklist").querySelectorAll("li:not(.ok)").forEach(li => li.addEventListener("click", () => setTab("edit")));
}

function renderNext() {
  const box = $("p-next");
  const up = bookings.filter(b => b.date >= todayKey() && ["pending", "confirmed"].includes(b.status))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  if (!up) {
    box.innerHTML = `<h3>${esc(t("profile.next"))}</h3>
      <div class="pf-empty"><span class="pf-empty-ico" aria-hidden="true">◇</span><p class="muted">${esc(t("profile.noNext"))}</p>
      <a class="btn btn-red btn-sm" href="book.html">${esc(t("profile.bookNow"))} <span class="arrow">→</span></a></div>`;
    return;
  }
  const n = daysUntil(up.date);
  const when = n <= 0 ? t("profile.today") : n === 1 ? t("profile.tomorrow") : t("profile.inDays", { n });
  const [y, m, d] = up.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  box.innerHTML = `<h3>${esc(t("profile.next"))}</h3>
    <div class="pf-next-body">
      <div class="date-block"><span class="db-m">${esc(fmtDay(up.date, { month: "short" }).replace(".", ""))}</span><strong>${d}</strong><span class="db-w">${esc(fmtDay(up.date, { weekday: "short" }).replace(".", ""))}</span></div>
      <div>
        <span class="pf-when">${esc(when)}</span>
        <strong class="pf-next-pkg">${esc(t(`pkg.${up.packageId}.name`))}</strong>
        <span class="muted small">${esc(fmtTime(up.time))} · ${esc(fmtDay(up.date, { day: "numeric", month: "long" }))}</span>
        <div style="margin-top:.5rem"><span class="badge badge-${esc(up.status)}">${esc(t(`status.${up.status}`))}</span></div>
      </div>
    </div>`;
  void dt;
}

function stepsHTML(status) {
  if (status === "cancelled") return `<div class="steps-bar cancelled"><span class="badge badge-cancelled">${esc(t("status.cancelled"))}</span></div>`;
  const cur = Math.max(0, REQ_STEPS.indexOf(status));
  return `<ol class="steps-bar" style="--p:${(cur / (REQ_STEPS.length - 1)).toFixed(3)}">
    ${REQ_STEPS.map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "now" : ""}"><span class="dot" aria-hidden="true"></span><span class="lbl">${esc(t(`status.${s}`))}</span></li>`).join("")}
  </ol>`;
}

function renderLatest() {
  const box = $("p-latest");
  const r = requests[0];
  if (!r) {
    box.innerHTML = `<h3>${esc(t("profile.latest"))}</h3>
      <div class="pf-empty"><span class="pf-empty-ico" aria-hidden="true">&lt;/&gt;</span><p class="muted">${esc(t("profile.noRequests"))}</p>
      <a class="btn btn-ghost btn-sm" href="custom.html">${esc(t("profile.requestNow"))} <span class="arrow">→</span></a></div>`;
    return;
  }
  box.innerHTML = `<h3>${esc(t("profile.latest"))}</h3>
    <div class="pf-latest-top"><strong>${esc(t(`type.${r.type}`))}</strong><span class="muted small">${esc(fmtDate(r.createdAt))}</span></div>
    <p class="muted small" style="margin:.2rem 0 1rem">${esc(r.business || "")}${r.business ? " · " : ""}${esc(t(`budget.${r.budget}`))}</p>
    ${stepsHTML(r.status)}`;
}

/* ---------- bookings & requests tabs ---------- */
function bookingRow(b, past) {
  const [, , d] = b.date.split("-").map(Number);
  const canCancel = !past && ["pending", "confirmed"].includes(b.status);
  return `<div class="tl-row${past ? " past" : ""}">
    <div class="date-block"><span class="db-m">${esc(fmtDay(b.date, { month: "short" }).replace(".", ""))}</span><strong>${d}</strong><span class="db-w">${esc(fmtDay(b.date, { weekday: "short" }).replace(".", ""))}</span></div>
    <div class="tl-info">
      <div class="list-item-top"><strong>${esc(t(`pkg.${b.packageId}.name`))}</strong><span class="badge badge-${esc(b.status)}">${esc(t(`status.${b.status}`))}</span></div>
      <span class="muted small">${esc(fmtDay(b.date))} · ${esc(fmtTime(b.time))}</span>
      ${canCancel ? `<div style="margin-top:.6rem"><button type="button" class="btn btn-danger btn-sm" data-cancel="${esc(b.id)}">${esc(t("profile.cancel"))}</button></div>` : ""}
    </div>
  </div>`;
}

function renderBookings() {
  const box = $("p-bookings");
  if (!bookings.length) {
    box.innerHTML = `<div class="pf-empty big"><span class="pf-empty-ico" aria-hidden="true">◇</span><p class="muted">${esc(t("profile.noBookings"))}</p><a class="btn btn-red btn-sm" href="book.html">${esc(t("profile.bookNow"))} <span class="arrow">→</span></a></div>`;
    return;
  }
  const tk = todayKey();
  const up = bookings.filter(b => b.date >= tk && b.status !== "cancelled").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = bookings.filter(b => !(b.date >= tk && b.status !== "cancelled"));
  box.innerHTML =
    (up.length ? `<h3 class="tl-head">${esc(t("profile.upcoming"))}</h3>${up.map(b => bookingRow(b, false)).join("")}` : "") +
    (past.length ? `<h3 class="tl-head">${esc(t("profile.past"))}</h3>${past.map(b => bookingRow(b, true)).join("")}` : "");
  box.querySelectorAll("[data-cancel]").forEach(btn => btn.addEventListener("click", () => cancelBooking(btn.dataset.cancel)));
}

function renderRequests() {
  const box = $("p-requests");
  if (!requests.length) {
    box.innerHTML = `<div class="pf-empty big"><span class="pf-empty-ico" aria-hidden="true">&lt;/&gt;</span><p class="muted">${esc(t("profile.noRequests"))}</p><a class="btn btn-red btn-sm" href="custom.html">${esc(t("profile.requestNow"))} <span class="arrow">→</span></a></div>`;
    return;
  }
  box.innerHTML = requests.map((r, i) => `<article class="card spot pf-req" style="--d:${i * 60}ms">
      <div class="pf-latest-top"><strong>${esc(t(`type.${r.type}`))}</strong><span class="muted small">${esc(fmtDate(r.createdAt))}</span></div>
      <p class="muted small" style="margin:.2rem 0 1rem">${esc(r.business || "")}${r.business ? " · " : ""}${esc(t(`budget.${r.budget}`))}${r.listingTitle ? ` · ${esc(r.listingTitle)}` : ""}</p>
      ${stepsHTML(r.status)}
    </article>`).join("");
}

function renderLists() { renderNext(); renderLatest(); renderBookings(); renderRequests(); renderStats(toDate((getProfile() || {}).createdAt)); }

async function loadLists(uid) {
  const loading = `<div class="loading">${esc(t("common.loading"))}</div>`;
  ["p-bookings", "p-requests", "p-next", "p-latest"].forEach(id => { $(id).innerHTML = loading; });
  try {
    const [bs, rs] = await withTimeout(Promise.all([
      fb.getDocs(fb.query(fb.collection(db, "bookings"), fb.where("uid", "==", uid))),
      fb.getDocs(fb.query(fb.collection(db, "requests"), fb.where("uid", "==", uid)))
    ]), 10000);
    bookings = bs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    requests = rs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
  } catch (e) {
    console.warn(e);
    toast(t(e.code === "timeout" ? "common.dbSlow" : "common.error"), "error");
  }
  renderLists();
}

async function cancelBooking(id) {
  if (!window.confirm(t("profile.cancelConfirm"))) return;
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  try {
    const batch = fb.writeBatch(db);
    batch.update(fb.doc(db, "bookings", id), { status: "cancelled", updatedAt: fb.serverTimestamp() });
    if (b.slotId) batch.delete(fb.doc(db, "slots", b.slotId));
    await withTimeout(batch.commit(), 10000);
    b.status = "cancelled";
    renderLists();
    toast(t("profile.cancelled"));
  } catch (e) {
    console.warn(e);
    toast(t("common.error"), "error");
  }
}

/* ---------- edit form ---------- */
async function usePhoto(file) {
  try {
    draft.photo = await imageToDataURL(file, 256, 0.85, true);
    renderHeader();
    glitchEl($("p-avatar-xl"));
  } catch {
    toast(t("profile.photoBad"), "error");
  }
}
$("p-file").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) usePhoto(f); });
const dz = $("dropzone");
["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) usePhoto(f); });

$("p-google").addEventListener("click", () => { draft.photo = ""; renderHeader(); });
$("p-remove").addEventListener("click", () => { draft.photo = "none"; renderHeader(); });
document.querySelectorAll("[data-banner]").forEach(b => b.addEventListener("click", () => { draft.banner = b.dataset.banner; renderHeader(); glitchEl($("p-banner")); }));
["p-name", "p-phone", "p-company"].forEach(id => $(id).addEventListener("input", renderHeader));
$("p-bio").addEventListener("input", () => { $("p-bio-count").textContent = `${$("p-bio").value.length} / 500`; renderCompleteness(); });

function renderSave() {
  const btn = $("p-save");
  btn.innerHTML = saving ? `<span class="spinner"></span> ${esc(t("profile.saving"))}` : `${esc(t("profile.save"))} <span class="arrow">→</span>`;
  btn.disabled = saving;
}

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
    await withTimeout(fb.setDoc(fb.doc(db, "users", u.uid), { uid: u.uid, email: u.email, ...patch }, { merge: true }), 10000);
    setProfile({ ...patch, updatedAt: new Date() });
    renderHeader();
    glitchEl($("p-hero-name"));
    toast(t("profile.saved"));
  } catch (err) {
    console.warn(err);
    toast(t(err.code === "timeout" ? "common.dbSlow" : "common.error"), "error");
  } finally {
    saving = false; renderSave();
  }
});

window.addEventListener("langchange", () => {
  if (!getUser()) return;
  renderHeader(); renderSave(); renderLists();
  requestAnimationFrame(moveTabInd);
});

/* ---------- start ---------- */
let loadedFor = null;
let touched = false;
$("profile-form").addEventListener("input", () => { touched = true; });

// Fresh profile from the database arrived (page started from the remembered one)
window.addEventListener("profileupdate", e => {
  const p = e.detail || {};
  if (!getUser() || touched || saving) { renderHeader(); return; }
  draft = { photo: p.photo || "", banner: BANNERS.includes(p.banner) ? p.banner : "red" };
  $("p-name").value = p.displayName || getUser().displayName || "";
  $("p-phone").value = p.phone || "";
  $("p-company").value = p.company || "";
  $("p-bio").value = p.bio || "";
  $("p-bio-count").textContent = `${$("p-bio").value.length} / 500`;
  renderHeader(); renderSave();
});
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
  $("p-bio-count").textContent = `${$("p-bio").value.length} / 500`;
  $("p-email").value = u.email || "";
  applyTranslations($("profile-wrap"));
  setTab(location.hash.slice(1) || "overview", false);
  renderHeader();
  renderSave();
  loadLists(u.uid);
  requestAnimationFrame(() => { moveTabInd(); document.querySelector(".pf-hero").classList.add("in"); });
  document.fonts?.ready.then(moveTabInd);
});
