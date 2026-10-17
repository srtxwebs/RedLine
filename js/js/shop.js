import { SITE, t, esc, toast, isConfigured } from "./app.js";
import { fetchPublicListings, cardHTML, wireCards, openListing, createdSec } from "./listings.js";

const state = { list: [], cat: "", sort: "new", loaded: false };
const $ = id => document.getElementById(id);

function renderFilters() {
  const cats = SITE.listingCategories.filter(c => state.list.some(l => l.category === c));
  const chip = (val, label) => `<button type="button" class="filter-chip${state.cat === val ? " active" : ""}" data-cat="${esc(val)}" aria-pressed="${state.cat === val}">${esc(label)}</button>`;
  $("filters").innerHTML = chip("", t("shop.all")) + cats.map(c => chip(c, t(`type.${c}`))).join("");
  $("filters").querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { state.cat = b.dataset.cat; render(); }));
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
    grid.innerHTML = `<div class="list-empty" style="grid-column:1/-1">${esc(t("shop.empty"))}</div>`;
    return;
  }
  grid.innerHTML = items.map(cardHTML).join("");
  wireCards(grid, items);
}

$("sort").addEventListener("change", e => { state.sort = e.target.value; render(); });
window.addEventListener("langchange", render);

async function load() {
  try {
    state.list = await fetchPublicListings();
  } catch (e) {
    console.warn(e);
    if (isConfigured) toast(t("common.error"), "error");
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

render();
load();
