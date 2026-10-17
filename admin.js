import { t, esc, db, fb, onUser, isAdmin, toast, gateHTML, wireGate } from "./app.js";
import { applyTranslations, money, fmtDay, fmtDate, fmtTime } from "./i18n.js";

const $ = id => document.getElementById(id);
const STATUSES = {
  bookings: ["pending", "confirmed", "completed", "cancelled"],
  requests: ["pending", "reviewing", "quoted", "in_progress", "completed", "cancelled"]
};

const state = { tab: "bookings", filter: "", data: { bookings: [], requests: [] } };

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
    ${STATUSES[state.tab].map(s => `<option value="${s}"${item.status === s ? " selected" : ""}>${esc(t(`status.${s}`))}</option>`).join("")}
  </select>`;
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
      <span class="hint">${esc(t("admin.received", { date: fmtDate(b.createdAt, { dateStyle: "medium", timeStyle: "short" }) }))}</span>
      <button type="button" class="btn btn-danger btn-sm" data-delete="${esc(b.id)}">${esc(t("admin.delete"))}</button>
    </div>
  </article>`;
}

function requestCard(r) {
  const links = String(r.links || "").split(/\s+/).filter(Boolean)
    .map(l => /^https?:\/\//i.test(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>` : esc(l)).join("<br>");
  return `<article class="card admin-item">
    <div>
      <h3>${esc(t(`type.${r.type}`))}${r.business ? ` · ${esc(r.business)}` : ""}</h3>
      ${contact(r)}
      <dl class="admin-details">
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
      <span class="hint">${esc(t("admin.received", { date: fmtDate(r.createdAt, { dateStyle: "medium", timeStyle: "short" }) }))}</span>
      <button type="button" class="btn btn-danger btn-sm" data-delete="${esc(r.id)}">${esc(t("admin.delete"))}</button>
    </div>
  </article>`;
}

function renderFilter() {
  const sel = $("a-filter");
  sel.innerHTML = `<option value="">${esc(t("admin.all"))}</option>` +
    STATUSES[state.tab].map(s => `<option value="${s}">${esc(t(`status.${s}`))}</option>`).join("");
  sel.value = STATUSES[state.tab].includes(state.filter) ? state.filter : "";
}

function render() {
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === state.tab);
    b.setAttribute("aria-selected", b.dataset.tab === state.tab ? "true" : "false");
  });
  $("count-bookings").textContent = state.data.bookings.length;
  $("count-requests").textContent = state.data.requests.length;
  renderFilter();
  const items = state.data[state.tab].filter(i => !state.filter || i.status === state.filter);
  const list = $("a-list");
  if (!items.length) {
    list.innerHTML = `<div class="list-empty">${esc(t("admin.empty"))}</div>`;
    return;
  }
  list.innerHTML = items.map(state.tab === "bookings" ? bookingCard : requestCard).join("");
  applyTranslations(list);
  list.querySelectorAll("[data-status]").forEach(s => s.addEventListener("change", () => updateStatus(s.dataset.status, s.value)));
  list.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => removeItem(b.dataset.delete)));
}

async function load() {
  $("a-list").innerHTML = `<div class="loading">${esc(t("common.loading"))}</div>`;
  try {
    const [bs, rs] = await Promise.all([
      fb.getDocs(fb.query(fb.collection(db, "bookings"), fb.orderBy("createdAt", "desc"))),
      fb.getDocs(fb.query(fb.collection(db, "requests"), fb.orderBy("createdAt", "desc")))
    ]);
    state.data.bookings = bs.docs.map(d => ({ id: d.id, ...d.data() }));
    state.data.requests = rs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(e);
    toast(t("common.error"), "error");
  }
  render();
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
    toast(t("common.error"), "error");
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

document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { state.tab = b.dataset.tab; state.filter = ""; render(); }));
$("a-filter").addEventListener("change", e => { state.filter = e.target.value; render(); });
$("a-refresh").addEventListener("click", load);

let loaded = false;
onUser(u => {
  $("a-loading").hidden = true;
  $("a-gate").hidden = !!u;
  $("a-denied").hidden = !u || isAdmin(u);
  $("a-panel").hidden = !u || !isAdmin(u);
  if (!u) { $("a-gate").innerHTML = gateHTML(); wireGate($("a-gate")); return; }
  if (isAdmin(u) && !loaded) { loaded = true; load(); }
});

window.addEventListener("langchange", () => { if (!$("a-panel").hidden) render(); });
