// FormAlive — minimal first-party cookie/consent notice.
// We don't use tracking cookies. This banner only records the visitor's
// preference in localStorage so we can stop showing it.
(function () {
  const KEY = 'formalive.cookie-consent';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch (_) {
    // localStorage blocked — show the banner but skip persisting.
  }

  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Cookie notice');
  wrap.className = 'cookie-banner';
  wrap.innerHTML = `
    <div class="cookie-banner__inner">
      <div class="cookie-banner__text">
        <strong>We respect your privacy.</strong>
        FormAlive doesn't use tracking cookies or third-party analytics on this
        site. We store a single first-party preference so this banner doesn't
        appear again. Read our
        <a href="cookies.html">Cookies notice</a> and
        <a href="privacy.html">Privacy policy</a>.
      </div>
      <div class="cookie-banner__actions">
        <button type="button" class="cookie-btn cookie-btn--ghost" data-cookie="decline">Decline</button>
        <button type="button" class="cookie-btn cookie-btn--primary" data-cookie="accept">Got it</button>
      </div>
    </div>
  `;

  function dismiss(choice) {
    try { localStorage.setItem(KEY, choice + ':' + Date.now()); } catch (_) {}
    wrap.classList.add('cookie-banner--out');
    setTimeout(() => wrap.remove(), 250);
  }

  wrap.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cookie]');
    if (!btn) return;
    dismiss(btn.dataset.cookie);
  });

  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(wrap));
  if (document.readyState !== 'loading') document.body.appendChild(wrap);
})();
