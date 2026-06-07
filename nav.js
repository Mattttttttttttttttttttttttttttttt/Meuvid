/* ================================================================
   nav.js — top bar rendering and binding
   Depends on: data.js, utils.js, auth.js
   ================================================================ */

/**
 * Render and bind the top navigation bar.
 *
 * @param {string}   currentPage  - id matching a NAV_ITEMS entry, or 'home'
 * @param {Function} onLoginClick - called when the "log in" button is clicked
 * @param {Function} onLogout     - called when the "log out" button is clicked
 */
function initNav(currentPage, onLoginClick, onLogout) {
  const loggedIn = AUTH.isLoggedIn();

  const links = NAV_ITEMS.map(n => `
    <a class="nav-link${currentPage === n.id ? ' active' : ''}" href="${n.href}">
      ${esc(n.label)}
    </a>`
  ).join('');

  const authBtn = loggedIn
    ? `<button class="btn btn-sm btn-ghost" id="nav-export-btn">export data.js</button>
       <button class="btn btn-sm" id="nav-logout-btn">log out</button>`
    : `<button class="btn btn-sm" id="nav-login-btn">log in</button>`;

  document.getElementById('topbar-container').innerHTML = `
    <header class="topbar">
      <a class="topbar-brand" href="index.html">Meuvid</a>
      <div class="topbar-sep"></div>
      <nav class="topbar-nav">${links}</nav>
      <div class="topbar-actions">${authBtn}</div>
    </header>`;

  const loginBtn = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const exportBtn = document.getElementById('nav-export-btn');

  if (loginBtn) loginBtn.addEventListener('click', onLoginClick);
  if (logoutBtn) logoutBtn.addEventListener('click', onLogout);
  if (exportBtn) exportBtn.addEventListener('click', exportDataJS);
}
