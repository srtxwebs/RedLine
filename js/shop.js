import { SITE, t, esc, toast, isConfigured, reduceMotion, onUser, isAdmin } from "./app.js";
import { fetchPublicListings, cachedListings, cardHTML, wireCards, openListing, createdSec } from "./listings.js";

const state = { list: [], cat: "", sort: "new", loaded: false };
const $ = id => document.getElementById(id);

// Animate cards moving into their new places when filtering / sorting
function smooth(update) {
  if (document.startViewTransition && !reduceMotion() && state.rendered) document.startViewTransition(update);
  else update();
}

function renderFilters() {
  const cats = SITE.listingCategories.filter(c => state.list.some(l => l.category === c));
  const chip = (val, label) => `<button type="button" class="filter-chip${state.cat === val ? " active" : ""}" data-cat="${esc(val)}" aria-pressed="${state.cat === val}">${esc(label)}</button>`;
  $("filters").innerHTML = chip("", t("shop.all")) + cats.map(c => chip(c, t(`type.${c}`))).join("");
  $("filters").querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => smooth(() => { state.cat = b.dataset.cat; render(); })));
}

function render() {
  renderFilters();
  if (!state.loaded) return;
  let items = state.list.filter(l => !state.cat || l.category === state.cat);
  if (state.sort === "low") items.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (state.sort === "high") items.sort((a, b) => (b.price || 0) - (a.price || 0));
  else items.sort((a, b) => createdSec(b) - createdSec(a));
  // sold ones go last
  items.sort((a, b) => (a.status === "sold") - (b.status === "sold"));

  $("count").textContent = items.length ? t("shop.count", { n: items.length }) : "";
  const grid = $("grid");
  if (!items.length) {
    grid.innerHTML = `<div class="list-empty" style="grid-column:1/-1">${esc(t(state.error ? "shop.loadError" : "shop.empty"))}</div>`;
    return;
  }
  grid.innerHTML = items.map(cardHTML).join("");
  if (state.rendered) grid.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  state.rendered = true;
  wireCards(grid, items);
}

$("sort").addEventListener("change", e => smooth(() => { state.sort = e.target.value; render(); }));
window.addEventListener("langchange", render);

async function load() {
  // 1) show what we already have right away
  const cached = cachedListings();
  if (cached) { state.list = cached; state.loaded = true; render(); }
  // 2) then get the latest from the database
  try {
    state.list = await fetchPublicListings();
    state.error = false;
  } catch (e) {
    console.warn("Listings:", e.code || e);
    if (!cached) state.error = true;
  }
  state.loaded = true;
  render();
  // Open a listing directly from a link: shop.html?id=xxxx
  const id = new URLSearchParams(location.search).get("id");
  if (id) {
    const l = state.list.find(x => x.id === id);
    if (l) openListing(l); else toast(t("shop.notFound"), "error");
  }
}

// Owner sees Edit / Delete on each card once signed in
let wasAdmin = false;
onUser(() => { const a = isAdmin(); if (a !== wasAdmin) { wasAdmin = a; if (state.loaded) render(); } });
$("grid").addEventListener("listingdeleted", e => {
  state.list = state.list.filter(l => l.id !== e.detail);
  setTimeout(render, 340);
});

render();
load();
