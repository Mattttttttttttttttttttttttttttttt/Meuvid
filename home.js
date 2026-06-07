/* ================================================================
   home.js — home page rendering
   Depends on: data.js, utils.js
   ================================================================ */

function renderHome(dict, roots) {
  const cards = HOME_CARDS.map(c => {
    const meta =
      c.id === 'dict'  ? `${dict.length} word${dict.length !== 1 ? 's' : ''}` :
      c.id === 'roots' ? `${roots.length} root${roots.length !== 1 ? 's' : ''}` :
      '';
    return `
      <a class="card-link" href="${c.href}">
        <div class="card">
          <div class="card-title">${esc(c.title)}</div>
          <div class="card-desc">${esc(c.desc)}</div>
          <div class="card-footer">
            <span class="card-meta">${meta}</span>
            <span class="card-chevron">${SVG_CHEVRON}</span>
          </div>
        </div>
      </a>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <main class="page">
      <div class="page-header">
        <h1 class="page-title">Meuvid</h1>
        <p class="page-subtitle">le auzmeus</p>
      </div>
      <div class="cards-grid">${cards}</div>
    </main>`;
}
