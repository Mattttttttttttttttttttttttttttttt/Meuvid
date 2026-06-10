/* ================================================================
   auth.js — authentication (login modal, logout)
   Depends on: data.js (for AUTH_HASH)
   ================================================================ */

const AUTH = (function () {

  /* ── private ── */

  let _onSuccess = null;

  function _modalContainer() {
    return document.getElementById('modal-container');
  }

  /** SHA-256 of s, returned as a hex string. Private — not exposed globally. */
  async function _hash(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function _loginModalHTML() {
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
          <p class="err-msg" id="login-err" style="display:none"></p>
          <button class="btn btn-primary" id="login-submit"
            style="width:100%;justify-content:center">log in</button>
        </div>
      </div>`;
  }

  function _closeModal() {
    _modalContainer().innerHTML = '';
  }

  function _renderModal() {
    _modalContainer().innerHTML = _loginModalHTML();
    document.getElementById('login-pw')?.focus();

    const overlay = document.getElementById('auth-overlay');
    const closeBtn = document.getElementById('auth-modal-close');
    const close = () => _closeModal();

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    const doLogin = async () => {
      const pw = document.getElementById('login-pw')?.value || '';
      const hash = await _hash(pw);
      if (hash === AUTH_HASH) {
        localStorage.setItem('mv_auth', '1');
        _closeModal();
        _onSuccess && _onSuccess();
      } else {
        /* show error in-place — no modal rebuild, focus stays in the field */
        const errEl = document.getElementById('login-err');
        if (errEl) { errEl.textContent = 'Incorrect password.'; errEl.style.display = ''; }
        const pwEl = document.getElementById('login-pw');
        if (pwEl) { pwEl.value = ''; pwEl.focus(); }
      }
    };

    const submit = document.getElementById('login-submit');
    const pwInput = document.getElementById('login-pw');
    if (submit) submit.addEventListener('click', doLogin);
    if (pwInput) pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  /* ── public API ── */

  return {
    /** Returns true if the user is currently logged in. */
    isLoggedIn() {
      return localStorage.getItem('mv_auth') === '1';
    },

    /** Clear the session. */
    logout() {
      localStorage.removeItem('mv_auth');
    },

    /**
     * Show the login modal.
     * @param {Function} onSuccess - called after successful login.
     */
    showLoginModal(onSuccess) {
      _onSuccess = onSuccess;
      _renderModal();
    },
  };
})();
