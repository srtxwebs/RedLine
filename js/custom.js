import { t, esc, db, fb, onUser, getUser, getProfile, ensureSignedIn, toast, authErrorText } from "./app.js";
import { getLang, money } from "./i18n.js";
import { isConfigured } from "./app.js";
import { titleOf } from "./listings.js";

const form = document.getElementById("custom-form");
const F = form.elements; // named form fields
const submitBtn = document.getElementById("c-submit");
let busy = false;
let listing = null;

// Coming from "I want this website": custom.html?listing=ID
const listingId = new URLSearchParams(location.search).get("listing");
function renderListingBanner() {
  const box = document.getElementById("listing-banner");
  if (!listing) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `${listing.thumb ? `<img src="${esc(listing.thumb)}" alt="">` : ""}
    <div><span class="hint">${esc(t("custom.fromListing"))}</span>
    <strong>${esc(titleOf(listing))}</strong>
    <span class="text-red">${esc(money(listing.price || 0))}</span></div>`;
}
async function loadListing() {
  if (!listingId || !isConfigured) return;
  try {
    const snap = await fb.getDoc(fb.doc(db, "listings", listingId));
    if (!snap.exists()) return;
    listing = { id: snap.id, ...snap.data() };
    if (listing.category && !F.type.value) F.type.value = listing.category;
    renderListingBanner();
  } catch (e) { console.warn(e); }
}
loadListing();

// No launch dates in the past
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
F.deadline.min = tomorrow.toISOString().slice(0, 10);

function renderButton() {
  if (busy) submitBtn.innerHTML = `<span class="spinner"></span> ${esc(t("custom.sending"))}`;
  else submitBtn.textContent = getUser() ? t("custom.submit") : t("custom.signinSubmit");
  submitBtn.disabled = busy;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const v = name => F[name].value.trim();
  const required = ["name", "email", "phone", "type", "budget", "description"];
  const missing = required.filter(n => !v(n));
  form.querySelectorAll("[required]").forEach(el => el.setAttribute("aria-invalid", missing.includes(el.name) ? "true" : "false"));
  if (missing.length || !F.email.checkValidity()) {
    toast(t("custom.required"), "error");
    F[missing[0] || "email"].focus();
    return;
  }

  let user;
  try { user = await ensureSignedIn(); }
  catch (err) { if (err.code !== "auth/popup-closed-by-user" && err.message !== "not-configured") toast(authErrorText(err), "error"); return; }

  busy = true; renderButton();
  try {
    await fb.addDoc(fb.collection(db, "requests"), {
      uid: user.uid,
      accountEmail: user.email,
      name: v("name"),
      email: v("email"),
      phone: v("phone"),
      business: v("business"),
      type: v("type"),
      pages: v("pages"),
      features: [...form.querySelectorAll('input[name="features"]:checked')].map(i => i.value),
      budget: v("budget"),
      deadline: v("deadline"),
      description: v("description"),
      links: v("links"),
      listingId: listing ? listing.id : "",
      listingTitle: listing ? (listing.titleEn || listing.titleEs || "") : "",
      status: "pending",
      lang: getLang(),
      createdAt: fb.serverTimestamp()
    });
    form.hidden = true;
    document.getElementById("custom-success").hidden = false;
    scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.warn(err);
    toast(t("common.error"), "error");
  } finally {
    busy = false; renderButton();
  }
});

renderButton();
window.addEventListener("langchange", () => { renderButton(); renderListingBanner(); });

onUser(u => {
  const p = getProfile();
  if (u) {
    if (!F.name.value) F.name.value = (p && p.displayName) || u.displayName || "";
    if (!F.email.value) F.email.value = u.email || "";
    if (!F.phone.value && p && p.phone) F.phone.value = p.phone;
    if (!F.business.value && p && p.company) F.business.value = p.company;
  }
  renderButton();
});
