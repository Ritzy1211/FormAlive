// Lightweight enhancements: scroll reveal, FAQ open accordion,
// pricing toggle, and demo "fill" animation. No frameworks.

// ---------- Scroll reveal ----------
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -80px 0px', threshold: 0.05 }
);
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ---------- FAQ accordion: only one open at a time ----------
document.querySelectorAll('.faq').forEach((faq) => {
  faq.addEventListener('toggle', () => {
    if (faq.open) {
      document.querySelectorAll('.faq').forEach((other) => {
        if (other !== faq) other.open = false;
      });
    }
  });
});

// ---------- Pricing toggle (monthly / yearly) ----------
const billToggle = document.getElementById('bill-toggle');
if (billToggle) {
  billToggle.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.bill-btn');
    if (!btn) return;
    billToggle
      .querySelectorAll('.bill-btn')
      .forEach((b) => b.classList.remove('bill-active'));
    btn.classList.add('bill-active');
    const bill = btn.dataset.bill;
    document.querySelectorAll('[data-price-monthly]').forEach((el) => {
      const v = bill === 'yearly' ? el.dataset.priceYearly : el.dataset.priceMonthly;
      el.textContent = `$${v}`;
    });
    document.querySelectorAll('[data-period-monthly]').forEach((el) => {
      el.textContent = bill === 'yearly' ? el.dataset.periodYearly : el.dataset.periodMonthly;
    });
  });
}

// ---------- Demo: animate fields filling on click ----------
const fillBtn = document.getElementById('demo-fill');
const resetBtn = document.getElementById('demo-reset');
const fieldEls = () => document.querySelectorAll('#demo-fields .demo-field');

if (fillBtn) {
  fillBtn.addEventListener('click', () => {
    const fields = fieldEls();
    fields.forEach((f) => f.classList.remove('filled'));
    fields.forEach((f, i) => {
      setTimeout(() => f.classList.add('filled'), 120 + i * 110);
    });
    // Pulse the banner briefly
    const banner = document.getElementById('demo-banner');
    if (banner) {
      banner.style.transform = 'scale(0.98)';
      setTimeout(() => (banner.style.transform = ''), 150);
    }
  });
}
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    fieldEls().forEach((f) => f.classList.remove('filled'));
  });
}

// Auto-play demo once when scrolled into view
const stage = document.getElementById('demo-stage');
if (stage) {
  const demoIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setTimeout(() => fillBtn && fillBtn.click(), 400);
          demoIo.unobserve(e.target);
        }
      }
    },
    { threshold: 0.4 }
  );
  demoIo.observe(stage);
}
