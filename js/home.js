import { SITE, t, esc } from "./app.js";
import { applyTranslations, money } from "./i18n.js";

const ICONS = {
  landing: '<path d="M4 5h16v14H4z"/><path d="M4 9h16M8 13h8M8 16h5"/>',
  business: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
  store: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/>',
  seo: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11l2 2 4-4"/>',
  care: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'
};

function renderServices() {
  const grid = document.getElementById("services-grid");
  grid.innerHTML = Object.keys(ICONS).map(k => `
    <article class="card service reveal in">
      <div class="service-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg></div>
      <h3 data-i18n="svc.${k}.t"></h3>
      <p data-i18n="svc.${k}.d"></p>
    </article>`).join("");
  applyTranslations(grid);
}

function renderPackages() {
  const grid = document.getElementById("packages-grid");
  grid.innerHTML = SITE.packages.map(p => {
    const features = t(`pkg.${p.id}.features`);
    return `
    <article class="card pkg${p.popular ? " popular" : ""}">
      ${p.popular ? `<span class="pkg-badge">${esc(t("pkg.popular"))}</span>` : ""}
      <h3>${esc(t(`pkg.${p.id}.name`))}</h3>
      <p class="muted">${esc(t(`pkg.${p.id}.desc`))}</p>
      <div class="pkg-price"><small>${esc(t("pkg.from"))}</small><strong>${esc(money(p.price))}</strong><small>${esc(SITE.currency)}</small></div>
      <ul>${(Array.isArray(features) ? features : []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      <a class="btn ${p.popular ? "btn-red" : "btn-ghost"} btn-block" href="book.html?package=${encodeURIComponent(p.id)}">${esc(t("pkg.choose"))}</a>
    </article>`;
  }).join("");
}

function revealOnScroll() {
  const els = document.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: .15 });
  els.forEach(e => io.observe(e));
}

renderServices();
renderPackages();
revealOnScroll();
window.addEventListener("langchange", renderPackages);
