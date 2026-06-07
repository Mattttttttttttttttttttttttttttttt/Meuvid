/* ================================================================
   auth.js — authentication (login modal, logout, password change)
   Depends on: utils.js
   ================================================================ */

const AUTH = (function () {

  /* ── private modal state ── */
  let _onSuccess   = null;
  let _loginError  = '';
  let _showCpw     = false;
  let _cpwMsg      = '';

  /* ── helpers ── */

  function _modalContainer() {
    return document.getElementById('modal-container');
  }

  function _loginModalHTML() {
    const err  = _loginError ? `<p class="err-msg">${esc(_loginError)}</p>` : '';
    const pmsg = _cpwMsg ? `<p style="font-size:15px;color:var(--text-2);margin-top:8px">${esc(_cpwMsg)}</p>` : '';
    const cpwForm = _showCpw ? `
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
        <div class="form-group">
          <label class="form-label">New password</label>
          <input class="form-input" type="password" id="new-pw" autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm</label>
          <input class="form-input" type="password" id="new-pw-2" autocomplete="new-password" />
        </div>
        ${pmsg}
        <button class="btn btn-primary btn-sm" id="set-pw-btn">set password</button>
      </div>` : '';

    return `
      <div class="overlay" id="auth-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <div class="modal-head">
            <div class="modal-title" id="auth-modal-title">Log in</div>
            <button class="btn btn-sm btn-ghost" id="auth-modal-close">✕</button>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="login-pw"
              placeholder="enter password" autocomplete="current-password" />
          </div>
          ${err}
          <button class="btn btn-primary" id="login-submit"
            style="width:100%;justify-content:center">log in</button>
          <p style="font-size:14px;color:var(--text-3);margin-top:10px">
            Default password: <code>meuvid</code>
          </p>
          <div class="pw-section">
            <button class="btn btn-sm btn-ghost" id="toggle-cpw">
              ${_showCpw ? 'cancel' : 'change password'}
            </button>
            ${cpwForm}
          </div>
        </div>
      </div>`;
  }

  function _renderModal() {
    _modalContainer().innerHTML = _loginModalHTML();
    _bindModalEvents();
    document.getElementById('login-pw')?.focus();
  }

  function _closeModal() {
    _modalContainer().innerHTML = '';
    _loginError = ''; _showCpw = false; _cpwMsg = '';
  }

  function _bindModalEvents() {
    const overlay = document.getElementById('auth-overlay');
    const closeBtn = document.getElementById('auth-modal-close');

    const close = () => _closeModal();
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay)  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Escape key
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    /* login */
    const doLogin = async () => {
      const pw     = document.getElementById('login-pw')?.value || '';
      const hash   = await hashStr(pw);
      const stored = localStorage.getItem('mv_pw');
      if (hash === stored) {
        localStorage.setItem('mv_auth', '1');
        _closeModal();
        _onSuccess && _onSuccess();
      } else {
        _loginError = 'Incorrect password.';
        _renderModal();
      }
    };

    const submit   = document.getElementById('login-submit');
    const pwInput  = document.getElementById('login-pw');
    if (submit)  submit.addEventListener('click', doLogin);
    if (pwInput) pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    /* toggle change-password form */
    const toggleCpw = document.getElementById('toggle-cpw');
    if (toggleCpw) toggleCpw.addEventListener('click', () => {
      _showCpw = !_showCpw; _cpwMsg = '';
      _renderModal();
      if (_showCpw) document.getElementById('new-pw')?.focus();
    });

    /* set new password */
    const setPwBtn = document.getElementById('set-pw-btn');
    if (setPwBtn) setPwBtn.addEventListener('click', async () => {
      const np  = document.getElementById('new-pw')?.value  || '';
      const np2 = document.getElementById('new-pw-2')?.value || '';
      if (!np)        { _cpwMsg = 'Enter a new password.';   _renderModal(); return; }
      if (np !== np2) { _cpwMsg = 'Passwords do not match.'; _renderModal(); return; }
      localStorage.setItem('mv_pw', await hashStr(np));
      _cpwMsg = 'Password changed successfully.';
      _renderModal();
    });
  }

  /* ── public API ── */

  return {
    /** Set up the default password hash on first visit. */
    async init() {
      if (!localStorage.getItem('mv_pw')) {
        localStorage.setItem('mv_pw', await hashStr('meuvid'));
      }
    },

    /** Returns true if the user is currently logged in. */
    isLoggedIn() {
      return localStorage.getItem('mv_auth') === '1';
    },

    /** Log out and clear session. */
    logout() {
      localStorage.removeItem('mv_auth');
    },

    /**
     * Show the login modal.
     * @param {Function} onSuccess - called after successful login.
     */
    showLoginModal(onSuccess) {
      _onSuccess  = onSuccess;
      _loginError = '';
      _showCpw    = false;
      _cpwMsg     = '';
      _renderModal();
    },
  };
})();
