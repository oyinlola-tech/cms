(function() {
  'use strict';

  const CMS = window.CMS = window.CMS || {};

  function formatCurrency(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return '₦0.00';
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      currencyDisplay: 'symbol',
      minimumFractionDigits: 2
    }).format(numeric);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(dateString, options) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }

  function showToast(message, type, duration) {
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-green-700' : type === 'error' ? 'bg-error' : 'bg-primary';
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    const ms = type === 'error' ? Math.max(duration || 3000, 6000) : (duration || 3000);
    toast.className = `fixed bottom-4 right-4 z-50 px-5 py-4 rounded-2xl shadow-2xl text-white transition-all ${bg} max-w-[92vw] w-[420px]`;
    toast.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="material-symbols-outlined text-xl leading-none">${icon}</span>
        <div class="flex-1 text-sm font-semibold leading-6">${escapeHtml(String(message || ''))}</div>
        <button type="button" class="p-1 rounded-lg hover:bg-white/10" aria-label="Close notification">
          <span class="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
    `;
    toast.querySelector('button')?.addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), ms);
  }

  function openModal(options) {
    const { title, contentHtml, onSubmit, submitLabel } = options;
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4';

    overlay.innerHTML = `
      <div class="w-full max-w-xl bg-surface rounded-2xl shadow-2xl overflow-hidden">
        <div class="px-6 py-5 border-b border-outline-variant/20 flex items-center justify-between">
          <h3 class="text-lg font-black text-primary">${escapeHtml(title)}</h3>
          <button type="button" data-modal-close class="p-2 rounded-lg hover:bg-surface-container-low transition-colors">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <form class="px-6 py-6 space-y-4" data-modal-form>
          ${contentHtml}
          <div class="pt-2 flex justify-end gap-3">
            <button type="button" data-modal-close class="px-5 py-2 rounded-xl font-bold bg-surface-container-low hover:bg-surface-container transition-colors">Cancel</button>
            <button type="submit" class="px-5 py-2 rounded-xl font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity">${submitLabel || 'Save'}</button>
          </div>
        </form>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', close));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const form = overlay.querySelector('[data-modal-form]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (typeof onSubmit === 'function') {
        await onSubmit(new FormData(form), close);
      } else {
        close();
      }
    });

    document.body.appendChild(overlay);
    return { close, overlay, form };
  }

  function renderPaginationControls(container, page, totalPages, onChange) {
    if (!container) return;
    const current = Number(page) || 1;
    const total = Number(totalPages) || 1;
    if (total <= 1) {
      container.innerHTML = '';
      return;
    }

    const makeBtn = (label, nextPage, disabled, isActive) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.disabled = disabled;
      btn.className = `px-3 py-2 rounded-lg text-xs font-black transition-colors ${
        isActive
          ? 'bg-primary text-on-primary'
          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-highest'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;
      btn.addEventListener('click', () => onChange(nextPage));
      return btn;
    };

    container.innerHTML = '';
    container.appendChild(makeBtn('Prev', Math.max(1, current - 1), current === 1));

    const windowSize = 5;
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    let end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    if (start > 1) container.appendChild(makeBtn('1', 1, false, current === 1));
    if (start > 2) {
      const dots = document.createElement('span');
      dots.className = 'px-2 text-xs font-bold text-on-surface-variant';
      dots.textContent = '...';
      container.appendChild(dots);
    }

    for (let p = start; p <= end; p++) {
      container.appendChild(makeBtn(String(p), p, false, p === current));
    }

    if (end < total - 1) {
      const dots = document.createElement('span');
      dots.className = 'px-2 text-xs font-bold text-on-surface-variant';
      dots.textContent = '...';
      container.appendChild(dots);
    }
    if (end < total) container.appendChild(makeBtn(String(total), total, false, current === total));

    container.appendChild(makeBtn('Next', Math.min(total, current + 1), current === total));
  }

  function showLoading(container) {
    if (!container) return;
    container.innerHTML = '<div class="flex justify-center py-8"><span class="material-symbols-outlined text-4xl animate-spin text-primary">sync</span></div>';
  }

  function hideLoading(container) {
    if (!container) return;
    container.innerHTML = '';
  }

  function showEmptyState(container, message, actionLabel, onAction) {
    if (!container) return;
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <span class="material-symbols-outlined text-6xl text-on-surface-variant opacity-50 mb-4">inbox</span>
        <p class="text-on-surface-variant font-medium">${escapeHtml(message)}</p>
        ${actionLabel && onAction ? `<button type="button" class="mt-4 px-5 py-2 rounded-xl font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity">${escapeHtml(actionLabel)}</button>` : ''}
      </div>
    `;
    if (actionLabel && onAction) {
      container.querySelector('button')?.addEventListener('click', onAction);
    }
  }

  function showErrorState(container, message, onRetry) {
    if (!container) return;
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <span class="material-symbols-outlined text-6xl text-error opacity-50 mb-4">error</span>
        <p class="text-error font-medium mb-4">${escapeHtml(message)}</p>
        ${onRetry ? `<button type="button" class="px-5 py-2 rounded-xl font-bold bg-error text-white hover:opacity-90 transition-opacity">Retry</button>` : ''}
      </div>
    `;
    if (onRetry) {
      container.querySelector('button')?.addEventListener('click', onRetry);
    }
  }

  /**
   * Mirrors the server's password policy (backend/utils/validation.js).
   *
   * The reset form previously only checked `length >= 8` while the server also
   * demanded upper, lower, digit and symbol, so valid-looking passwords came
   * back as an opaque "Invalid request".
   *
   * @param {string} password
   * @returns {string[]} - Human-readable failures; empty when acceptable
   */
  function validatePasswordStrength(password) {
    const errors = [];
    if (typeof password !== 'string' || !password) {
      return ['Password is required'];
    }
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (password.length > 128) errors.push('Password must be at most 128 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    return errors;
  }

  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Binds the sidebar logout button.
   *
   * Only the dashboard page wired this up, so "Logout" was inert on every
   * other admin screen. Doing it once here covers all of them.
   */
  /**
   * Wires any [data-target] password visibility toggle.
   *
   * Only the reset-password page implemented this, so the toggle added to the
   * sign-in form would otherwise have been inert. Doing it once here covers
   * every auth screen.
   */
  /**
   * Puts a submit button into its busy state and returns a restore function.
   *
   * Assigning to button.textContent (as the auth pages used to) destroys any
   * markup inside the button - here, the arrow - and hard-codes the idle label
   * in the script, so it silently drifts from the markup. Capturing the
   * original HTML avoids both problems.
   *
   * @param {HTMLButtonElement} button
   * @param {string} busyLabel
   * @returns {Function} restore
   */
  function setButtonBusy(button, busyLabel) {
    if (!button) return () => {};

    if (button.dataset.idleHtml === undefined) {
      button.dataset.idleHtml = button.innerHTML;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = busyLabel;

    return function restore() {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = button.dataset.idleHtml;
    };
  }

  function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach((button) => {
      if (button.dataset.toggleBound === 'true') return;
      button.dataset.toggleBound = 'true';

      button.addEventListener('click', () => {
        const target = document.querySelector(button.getAttribute('data-target') || '');
        if (!target) return;

        const revealed = target.type === 'text';
        target.type = revealed ? 'password' : 'text';
        button.setAttribute('aria-pressed', String(!revealed));

        const label = button.querySelector('.sr-only');
        if (label) label.textContent = revealed ? 'Show password' : 'Hide password';

        const icon = button.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = revealed ? 'visibility' : 'visibility_off';
      });
    });
  }

  function initLogoutButton() {
    const button = document.getElementById('logout-btn');
    if (!button || button.dataset.logoutBound === 'true') return;

    button.dataset.logoutBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (CMS.auth && typeof CMS.auth.logout === 'function') {
        CMS.auth.logout();
      }
    });
  }

  function normalizeAdminSidebar() {
    // Match the dashboard sidebar explicitly. Selecting "the first <aside> on
    // any /admin path" also caught the sign-in page's brand panel and forced
    // it to w-64/fixed, collapsing that layout.
    const aside = document.querySelector('aside[data-admin-sidebar]');
    if (!aside) return;

    aside.classList.add('w-64', 'fixed', 'left-0', 'top-0', 'h-screen');

    const navLinks = aside.querySelectorAll('nav a[href]');
    navLinks.forEach(a => {
      a.classList.remove('bg-primary', 'text-on-primary', 'text-white', 'scale-95');
      a.classList.remove('hover:bg-surface-container-highest', 'opacity-70');
      a.classList.add('mx-2', 'my-1', 'px-4', 'py-3', 'rounded-xl', 'transition-all', 'flex', 'items-center', 'gap-3', 'text-sm', 'font-semibold');
      const href = a.getAttribute('href');
      if (href && href === window.location.pathname) {
        a.classList.add('bg-primary', 'text-on-primary');
      } else {
        a.classList.add('text-primary', 'opacity-70', 'hover:bg-surface-container-highest');
      }
    });
  }

  function renderPublicChrome() {
    if (window.location.pathname.startsWith('/admin')) return;

    const header = document.querySelector('header');
    if (!header) return;

    const nav = header.querySelector('nav');
    if (!nav) return;

    // Only the active-link marker is applied here. This function used to
    // force `bg-primary text-on-primary` onto every public header, overriding
    // the per-page designs (several pages use a light header on purpose).
    nav.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      const path = window.location.pathname;
      const isActive = href === path || (href !== '/' && href.length > 1 && path.startsWith(href));
      a.classList.toggle('font-black', Boolean(isActive));
      if (isActive) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  function updateFooterYear() {
    const currentYear = String(new Date().getFullYear());

    // Explicit opt-in markers are updated directly.
    document.querySelectorAll('[data-copyright-year]').forEach(el => {
      el.textContent = currentYear;
    });

    // Otherwise find the copyright year in the footer and rewrite only that
    // text node.
    //
    // The previous implementation matched every `footer div` and assigned to
    // `el.textContent`, which meant the OUTERMOST matching div - the one
    // wrapping the whole footer - had its entire subtree replaced by a single
    // flattened string, destroying the layout and every link inside it.
    // Walking text nodes touches the year and nothing else.
    // NodeFilter.SHOW_TEXT is 4; read it defensively so the helper also runs
    // under DOM implementations that do not expose the global.
    const SHOW_TEXT = (typeof NodeFilter !== 'undefined' && NodeFilter.SHOW_TEXT) || 4;

    document.querySelectorAll('footer').forEach(footer => {
      const walker = document.createTreeWalker(footer, SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes('©') && /\b(19|20)\d{2}\b/.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/\b(19|20)\d{2}\b/, currentYear);
        }
      }
    });
  }

  /**
   * Public pages that are shorter than the viewport used to leave the footer
   * floating mid-screen with blank space beneath it. Promoting the page to a
   * flex column and letting <main> grow pins the footer to the bottom.
   */
  function applyStickyFooter() {
    const body = document.body;
    const footer = document.querySelector('footer');
    if (!body || !footer || footer.parentElement !== body) return;

    body.classList.add('min-h-screen', 'flex', 'flex-col');

    const main = body.querySelector(':scope > main');
    if (main) {
      main.classList.add('flex-1');
    } else {
      // No <main>: make the footer itself the element pushed to the bottom.
      footer.classList.add('mt-auto');
    }
  }

  CMS.shared = {
    formatCurrency,
    formatDate,
    formatTime,
    timeAgo,
    escapeHtml,
    showToast,
    openModal,
    renderPaginationControls,
    showLoading,
    hideLoading,
    showEmptyState,
    showErrorState,
    debounce,
    validatePasswordStrength,
    normalizeAdminSidebar,
    initLogoutButton,
    initPasswordToggles,
    setButtonBusy,
    renderPublicChrome,
    updateFooterYear,
    applyStickyFooter,
    init: function() {
      this.normalizeAdminSidebar();
      this.initLogoutButton();
      this.initPasswordToggles();
      this.renderPublicChrome();
      this.applyStickyFooter();
      this.updateFooterYear();
    }
  };

})();