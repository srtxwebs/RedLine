import { SITE, t, esc, db, fb, isConfigured, onUser, getUser, getProfile, ensureSignedIn, toast, authErrorText } from "./app.js";
import { applyTranslations, money, fmtDay, fmtTime, locale, getLang } from "./i18n.js";

const MAX_DAYS_AHEAD = 90;

const today = new Date(); today.setHours(0, 0, 0, 0);
const minDate = new Date(today); minDate.setDate(minDate.getDate() + 1);
const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);

const params = new URLSearchParams(location.search);
const state = {
  pkg: SITE.packages.some(p => p.id === params.get("package")) ? params.get("package") : null,
  date: null,
  time: null,
  viewYear: minDate.getFullYear(),
  viewMonth: minDate.getMonth(),
  taken: new Set(),
  loadingSlots: false,
  busy: false
};

const $ = id => document.getElementById(id);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------- packages ----------
function renderPackages() {
  const box = $("pkg-options");
  box.innerHTML = SITE.packages.map(p => `
    <button type="button" class="pkg-option${state.pkg === p.id ? " selected" : ""}" data-pkg="${esc(p.id)}" aria-pressed="${state.pkg === p.id}">
      <span class="check" aria-hidden="true"></span>
      <strong>${esc(t(`pkg.${p.id}.name`))}</strong>
      <small>${esc(t("pkg.from"))}</small>
      <span class="price">${esc(money(p.price))}</span>
    </button>`).join("");
  box.querySelectorAll("[data-pkg]").forEach(b => b.addEventListener("click", () => {
    state.pkg = b.dataset.pkg;
    renderPackages();
    renderSummary();
  }));
}

// ---------- calendar ----------
function renderCalendar() {
  const first = new Date(state.viewYear, state.viewMonth, 1);
  const title = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(first);
  $("cal-title").textContent = title.charAt(0).toUpperCase() + title.slice(1);
  $("cal-prev").disabled = state.viewYear === minDate.getFullYear() && state.viewMonth === minDate.getMonth();
  $("cal-next").disabled = state.viewYear === maxDate.getFullYear() && state.viewMonth === maxDate.getMonth();

  // Weekday names in the current language (Sunday first)
  const sunday = new Date(2026, 0, 4);
  let html = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i);
    html += `<div class="cal-dow">${esc(new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(d).replace(".", ""))}</div>`;
  }
  for (let i = 0; i < first.getDay(); i++) html += `<div class="cal-empty"></div>`;

  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(state.viewYear, state.viewMonth, day);
    const key = ymd(d);
    const closed = SITE.closedWeekdays.includes(d.getDay());
    const disabled = d < minDate || d > maxDate || closed;
    const cls = ["cal-day"];
    if (key === state.date) cls.push("selected");
    if (+d === +today) cls.push("today");
    const label = fmtDay(key) + (closed ? ` — ${t("book.closedDay")}` : "");
    html += `<button type="button" class="${cls.join(" ")}" data-day="${key}" ${disabled ? "disabled" : ""} aria-label="${esc(label)}" aria-pressed="${key === state.date}">${day}</button>`;
  }
  const grid = $("cal-grid");
  grid.innerHTML = html;
  grid.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => selectDate(b.dataset.day)));
}

async function selectDate(key) {
  state.date = key;
  state.time = null;
  renderCalendar();
  renderSummary();
  await loadTaken();
}

async function loadTaken() {
  state.taken = new Set();
  if (!state.date) return renderSlots();
  state.loadingSlots = true;
  renderSlots();
  if (isConfigured) {
    try {
      const snap = await fb.getDocs(fb.query(fb.collection(db, "slots"), fb.where("date", "==", state.date)));
      snap.forEach(d => {
        const time = d.id.split("_")[1];
        if (time) state.taken.add(`${time.slice(0, 2)}:${time.slice(2)}`);
      });
    } catch (e) { console.warn(e); }
  }
  state.loadingSlots = false;
  renderSlots();
}

function renderSlots() {
  const box = $("slots");
  if (!state.date) { box.innerHTML = `<div class="slots-empty">${esc(t("book.pickDateFirst"))}</div>`; return; }
  if (state.loadingSlots) { box.innerHTML = `<div class="slots-empty">${esc(t("common.loading"))}</div>`; return; }
  const free = SITE.timeSlots.filter(s => !state.taken.has(s));
  if (!free.length) { box.innerHTML = `<div class="slots-empty">${esc(t("book.noSlots"))}</div>`; return; }
  box.innerHTML = SITE.timeSlots.map(s => {
    const taken = state.taken.has(s);
    return `<button type="button" class="slot${state.time === s ? " selected" : ""}" data-time="${s}" ${taken ? "disabled" : ""} aria-pressed="${state.time === s}">${esc(fmtTime(s))}</button>`;
  }).join("");
  box.querySelectorAll("[data-time]").forEach(b => b.addEventListener("click", () => {
    state.time = b.dataset.time;
    renderSlots();
    renderSummary();
  }));
}

// ---------- summary ----------
function renderSummary() {
  const pkg = SITE.packages.find(p => p.id === state.pkg);
  $("sum-pkg").textContent = pkg ? t(`pkg.${pkg.id}.name`) : t("book.none");
  $("sum-price").textContent = pkg ? money(pkg.price) : t("book.none");
  $("sum-date").textContent = state.date ? fmtDay(state.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : t("book.none");
  $("sum-time").textContent = state.time ? fmtTime(state.time) : t("book.none");
  const btn = $("confirm-btn");
  if (state.busy) {
    btn.innerHTML = `<span class="spinner"></span> ${esc(t("book.booking"))}`;
  } else {
    btn.textContent = getUser() ? t("book.confirm") : t("book.signinConfirm");
  }
  btn.disabled = state.busy;
}

// ---------- confirm ----------
async function confirm() {
  const name = $("b-name").value.trim();
  const phone = $("b-phone").value.trim();
  if (!state.pkg || !state.date || !state.time) return toast(t("book.missing"), "error");
  if (!name || !phone) return toast(t("book.missingName"), "error");

  let user;
  try { user = await ensureSignedIn(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.message !== "not-configured") toast(authErrorText(e), "error"); return; }

  state.busy = true; renderSummary();
  const pkg = SITE.packages.find(p => p.id === state.pkg);
  const slotId = `${state.date}_${state.time.replace(":", "")}`;
  const bookingRef = fb.doc(fb.collection(db, "bookings"));
  const batch = fb.writeBatch(db);
  batch.set(fb.doc(db, "slots", slotId), { uid: user.uid, bookingId: bookingRef.id, date: state.date, createdAt: fb.serverTimestamp() });
  batch.set(bookingRef, {
    uid: user.uid,
    email: user.email,
    name,
    phone,
    notes: $("b-notes").value.trim(),
    packageId: pkg.id,
    price: pkg.price,
    currency: SITE.currency,
    date: state.date,
    time: state.time,
    slotId,
    status: "pending",
    lang: getLang(),
    createdAt: fb.serverTimestamp()
  });

  try {
    await batch.commit();
    $("book-form").hidden = true;
    $("book-success").hidden = false;
    $("success-detail").innerHTML = `<strong>${esc(t(`pkg.${pkg.id}.name`))}</strong> · ${esc(fmtDay(state.date))} · ${esc(fmtTime(state.time))}`;
    scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.warn(e);
    if (e.code === "permission-denied") {
      toast(t("book.taken"), "error");
      state.time = null;
      await loadTaken();
    } else {
      toast(t("common.error"), "error");
    }
  } finally {
    state.busy = false;
    renderSummary();
  }
}

// ---------- start ----------
$("cal-prev").addEventListener("click", () => {
  state.viewMonth--; if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
  renderCalendar();
});
$("cal-next").addEventListener("click", () => {
  state.viewMonth++; if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
  renderCalendar();
});
$("confirm-btn").addEventListener("click", confirm);

function renderAll() {
  renderPackages(); renderCalendar(); renderSlots(); renderSummary();
  const detail = $("success-detail");
  if (!$("book-success").hidden && state.pkg && state.date && state.time) {
    detail.innerHTML = `<strong>${esc(t(`pkg.${state.pkg}.name`))}</strong> · ${esc(fmtDay(state.date))} · ${esc(fmtTime(state.time))}`;
  }
  applyTranslations($("book-success"));
}

renderAll();
window.addEventListener("langchange", renderAll);

onUser(() => {
  const p = getProfile(), u = getUser();
  if (u) {
    if (!$("b-name").value) $("b-name").value = (p && p.displayName) || u.displayName || "";
    if (!$("b-phone").value && p && p.phone) $("b-phone").value = p.phone;
  }
  renderSummary();
});
