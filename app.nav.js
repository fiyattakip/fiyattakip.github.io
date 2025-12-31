// Simple, stable page navigation for FiyatTakip (no framework)
export function initNav({ onPageChange } = {}) {
  const pages = Array.from(document.querySelectorAll('[id^="page-"]'));
  const navBtns = Array.from(document.querySelectorAll('[data-page]'));

  function showPage(name) {
    // hide all
    pages.forEach(p => p.classList.remove('active'));
    navBtns.forEach(b => b.classList.remove('active'));

    const pageEl = document.getElementById(`page-${name}`);
    if (pageEl) pageEl.classList.add('active');

    const btn = navBtns.find(b => b.dataset.page === name);
    if (btn) btn.classList.add('active');

    try { onPageChange && onPageChange(name); } catch {}
  }

  // Click handlers
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // Default page
  showPage('home');

  return { showPage };
}
