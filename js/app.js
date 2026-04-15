(function() {
  'use strict';
  const API_BASE = window.API_BASE_URL || '/api';
  
  // Auth token management
  let authToken = localStorage.getItem('authToken') || null;
  let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  
  // Format currency (NGN)
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
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Format date
  function formatDate(dateString, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', options);
  }

  // Format time
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

  // Show toast notification
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-green-700' : type === 'error' ? 'bg-error' : 'bg-primary';
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    const ms = type === 'error' ? Math.max(duration, 6000) : duration;
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

  function openModal({ title, contentHtml, onSubmit, submitLabel = 'Save' }) {
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
            <button type="submit" class="px-5 py-2 rounded-xl font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity">${submitLabel}</button>
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

    const makeBtn = (label, nextPage, disabled = false, isActive = false) => {
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

  function normalizeAdminSidebar() {
    if (!window.location.pathname.startsWith('/admin')) return;
    const aside = document.querySelector('aside');
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
    const footer = document.querySelector('footer');
    if (!header || !footer) return;

    const pathNow = window.location.pathname;
    const navItems = [
      { href: '/', label: 'Home' },
      { href: '/programs', label: 'Programs' },
      { href: '/announcements', label: 'Announcements' },
      { href: '/gallery', label: 'Gallery' },
      { href: '/contact', label: 'Contact' }
    ];
    const isActive = (href) => href !== '/' ? pathNow.startsWith(href) : pathNow === '/';

    header.className = 'bg-[#fbf9f5] sticky top-0 z-50 border-b border-outline-variant/20';
    header.innerHTML = `
      <nav class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <a href="/" class="font-headline text-xl font-black text-primary">The Sacred Hearth</a>
        <div class="hidden md:flex items-center gap-8 font-headline text-base font-medium">
          ${navItems.map(i => `
            <a href="${i.href}" class="${isActive(i.href) ? 'text-secondary border-b-2 border-secondary pb-1' : 'text-primary/80 hover:text-secondary transition-colors'}">${i.label}</a>
          `).join('')}
        </div>
        <div class="flex items-center gap-3">
          <a href="/admin/login" class="hidden sm:inline-flex bg-primary text-on-primary px-5 py-2.5 rounded-full font-semibold hover:opacity-90 transition-opacity">Login</a>
          <button type="button" id="mobile-menu-btn" class="md:hidden p-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors text-primary">
            <span class="material-symbols-outlined">menu</span>
          </button>
        </div>
      </nav>
      <div id="mobile-menu" class="md:hidden hidden border-t border-outline-variant/20 bg-[#fbf9f5]">
        <div class="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-3">
          ${navItems.map(i => `
            <a href="${i.href}" class="px-4 py-3 rounded-xl font-semibold ${isActive(i.href) ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-primary hover:bg-surface-container-high'}">${i.label}</a>
          `).join('')}
          <a href="/admin/login" class="px-4 py-3 rounded-xl font-bold bg-secondary-container text-on-secondary-container">Admin Login</a>
        </div>
      </div>
    `;

    footer.className = 'bg-primary py-14 mt-20';
    footer.innerHTML = `
      <div class="max-w-7xl mx-auto px-6 flex flex-col items-center gap-7 text-center">
        <div class="font-headline text-white text-2xl font-black">The Sacred Hearth</div>
        <div class="flex flex-wrap justify-center gap-8 text-on-primary/70 text-sm font-semibold">
          <a class="hover:text-white transition-opacity" href="/privacy">Privacy</a>
          <a class="hover:text-white transition-opacity" href="/terms">Terms</a>
          <a class="hover:text-white transition-opacity" href="/give">Give</a>
          <a class="hover:text-white transition-opacity" href="/contact">Contact</a>
        </div>
        <div class="w-full max-w-lg h-px bg-primary-container"></div>
        <div class="text-on-primary/40 text-sm font-semibold">© 2026 The Sacred Hearth Okitipupa. All Rights Reserved.</div>
      </div>
    `;

    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    btn?.addEventListener('click', () => {
      menu?.classList.toggle('hidden');
    });
  }

  async function wireExternalLinks() {
    if (window.location.pathname.startsWith('/admin')) return;
    const targets = Array.from(document.querySelectorAll('[data-link-key]'));
    if (targets.length === 0) return;
    try {
      const links = await apiRequest('/public/links');
      targets.forEach(el => {
        const key = el.getAttribute('data-link-key');
        const url = key && links ? links[key] : null;
        if (typeof url !== 'string' || !url.trim()) {
          el.setAttribute('aria-disabled', 'true');
          el.classList.add('opacity-70', 'cursor-not-allowed');
          return;
        }
        const clean = url.trim();
        if (el.tagName.toLowerCase() === 'a') {
          el.setAttribute('href', clean);
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        } else {
          el.addEventListener('click', () => {
            window.open(clean, '_blank', 'noopener');
          });
        }
      });
    } catch (_) {
      // ignore for public pages
    }
  }

  // API request wrapper
  async function apiRequest(endpoint, options = {}) {
    const parseAs = options.parseAs || 'json'; 
    const headers = { ...(options.headers || {}) };

    const method = (options.method || 'GET').toUpperCase();
    const body = options.body;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData && method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });
      
      // Handle unauthorized (token expired)
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        if (window.location.pathname.includes('/admin') && 
            !window.location.pathname.includes('/login')) {
          window.location.href = '/admin/login';
        }
        throw new Error('Unauthorized');
      }
      
      const contentType = response.headers.get('content-type') || '';
      const shouldParseJson = parseAs === 'json' && contentType.includes('application/json');

      let data;
      if (parseAs === 'blob') data = await response.blob();
      else if (parseAs === 'text') data = await response.text();
      else if (shouldParseJson) data = await response.json();
      else data = await response.text();

      if (!response.ok) {
        const message = typeof data === 'object' && data && data.message ? data.message : (typeof data === 'string' ? data : 'Request failed');
        throw new Error(message);
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }
  
  async function login(email, password, remember) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    return data;
  }

  function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/admin/login';
  }
  function requireAuth() {
    if (!authToken) {
      window.location.href = '/admin/login';
      return false;
    }
    return true;
  }
  
  const path = window.location.pathname;
  const memberDetailsMatch = path.match(/^\/admin\/members\/(\d+)$/);
  const announcementDetailsMatch = path.match(/^\/announcements\/(\d+)$/);
    const pageDetector = {
    isHome: path === '/' || path === '/public/index.html',
    isPrograms: path === '/programs' || path === '/public/pages/programs.html',
    isGallery: path === '/gallery' || path === '/public/pages/gallery.html',
    isAnnouncements: path === '/announcements' || path === '/public/pages/announcements.html',
    isAnnouncementDetails: Boolean(announcementDetailsMatch),
    announcementId: announcementDetailsMatch ? announcementDetailsMatch[1] : null,
    isContact: path === '/contact' || path === '/public/pages/contact.html',
    isLogin: path === '/admin/login' || path === '/src/auth/login.html',
    isForgotPassword: path === '/admin/forgot-password',
    isVerifyOTP: path === '/admin/verify-otp',
    isResetPassword: path === '/admin/reset-password',
    isDashboard: path === '/admin/dashboard' || path === '/src/pages/dashboard.html',
    isMembers: path === '/admin/members' || path === '/src/pages/members.html',
    isMemberDetails: Boolean(memberDetailsMatch),
    memberId: memberDetailsMatch ? memberDetailsMatch[1] : null,
    isFinance: path === '/admin/finance' || path === '/src/pages/finance.html',
    isProgramsAdmin: path === '/admin/programs' || path === '/src/pages/programs.html',
    isAnnouncementsAdmin: path === '/admin/announcements' || path === '/src/pages/announcements.html',
    isGalleryAdmin: path === '/admin/gallery' || path === '/src/pages/gallery.html',
    isReports: path === '/admin/reports' || path === '/src/pages/reports.html',
    isSettings: path === '/admin/settings' || path === '/src/pages/settings.html'
  };
  
  // Homepage
  async function initHome() {
    await Promise.all([
      fetchHomeAnnouncements(),
      fetchHomePrograms(),
      fetchHomeGallery()
    ]);
  }

  async function fetchHomeAnnouncements() {
    try {
      const data = await apiRequest('/announcements?limit=3&status=published');
      renderHomeAnnouncements(data.items || []);
    } catch (error) {
      console.error('Failed to load announcements:', error);
    }
  }

  function renderHomeAnnouncements(announcements) {
    const container = document.getElementById('announcements-container');
    if (!container) return;
    if (!announcements || announcements.length === 0) {
      container.innerHTML = '<p class="col-span-12 text-center text-on-surface-variant py-12">No announcements yet.</p>';
      return;
    }

    const featured = announcements[0];
    const smalls = announcements.slice(1, 3);

    let html = `
      <div class="col-span-12 md:col-span-8 bg-surface-container-low rounded-xl overflow-hidden flex flex-col md:flex-row group">
        <div class="md:w-1/2 overflow-hidden">
          <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
               src="${escapeHtml(featured.image_url || '/images/placeholder.svg')}" alt="${escapeHtml(featured.title)}">
        </div>
        <div class="md:w-1/2 p-8 flex flex-col justify-center space-y-4">
          <span class="text-secondary font-bold text-xs uppercase tracking-widest">${escapeHtml(featured.category || 'Announcement')}</span>
          <h3 class="font-headline text-3xl font-bold text-primary">${escapeHtml(featured.title)}</h3>
          <p class="text-on-surface-variant">${escapeHtml(featured.summary)}</p>
          <a href="/announcements/${featured.id}" class="text-primary font-bold w-fit border-b-2 border-primary/20 pb-1 hover:border-primary transition-all">Read More</a>
        </div>
      </div>
      <div class="col-span-12 md:col-span-4 space-y-6">
    `;

    smalls.forEach(item => {
      html += `
        <div class="bg-surface-container-lowest p-6 rounded-xl space-y-3 shadow-sm">
          <div class="flex justify-between items-start">
            ${item.is_new ? '<span class="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-bold">New</span>' : ''}
            <span class="text-on-surface-variant text-sm">${formatDate(item.created_at)}</span>
          </div>
          <h4 class="font-headline text-xl font-bold text-primary">${escapeHtml(item.title)}</h4>
          <p class="text-sm text-on-surface-variant">${escapeHtml(item.summary)}</p>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  async function fetchHomePrograms() {
    try {
      const data = await apiRequest('/programs?limit=3');
      renderHomePrograms(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load programs:', error);
    }
  }

  function renderHomePrograms(programs) {
    const container = document.getElementById('programs-container');
    if (!container) return;
    if (!programs || programs.length < 3) {
      container.innerHTML = '<p class="col-span-3 text-center text-on-surface-variant py-12">Program schedule coming soon.</p>';
      return;
    }

    const iconMap = {
      'devotion': 'event',
      'service': 'church',
      'fellowship': 'groups',
      'bible_study': 'menu_book'
    };

    const prog1 = programs[0];
    const prog2 = programs[1];
    const prog3 = programs[2];

    container.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl p-8 space-y-6 transform md:-translate-y-4">
        <div class="w-14 h-14 bg-secondary-container flex items-center justify-center rounded-xl">
          <span class="material-symbols-outlined text-on-secondary-container text-3xl">${iconMap[prog1.type] || 'event'}</span>
        </div>
        <h3 class="font-headline text-2xl font-bold text-primary">${escapeHtml(prog1.title)}</h3>
        <p class="text-on-surface-variant">${escapeHtml(prog1.description)}</p>
        <div class="pt-4 border-t border-outline-variant/30 flex items-center gap-3">
          <span class="material-symbols-outlined text-secondary">schedule</span>
          <span class="text-sm font-semibold">${escapeHtml(prog1.schedule)}</span>
        </div>
      </div>
      <div class="bg-primary text-on-primary rounded-xl p-8 space-y-6 shadow-2xl scale-105 z-10 relative">
        <div class="absolute -top-4 -right-4 bg-secondary-container text-on-secondary-fixed px-4 py-2 rounded-lg font-black text-xs uppercase">Main Service</div>
        <div class="w-14 h-14 bg-surface-container-highest flex items-center justify-center rounded-xl">
          <span class="material-symbols-outlined text-primary text-3xl">${iconMap[prog2.type] || 'church'}</span>
        </div>
        <h3 class="font-headline text-2xl font-bold">${escapeHtml(prog2.title)}</h3>
        <p class="opacity-80">${escapeHtml(prog2.description)}</p>
        <div class="pt-4 border-t border-on-primary/20 flex items-center gap-3">
          <span class="material-symbols-outlined text-secondary-fixed">schedule</span>
          <span class="text-sm font-semibold">${escapeHtml(prog2.schedule)}</span>
        </div>
        <button class="w-full py-3 bg-secondary-container text-on-secondary-fixed rounded-xl font-bold mt-4 hover:bg-secondary-fixed transition-colors">Plan Your Visit</button>
      </div>
      <div class="bg-surface-container-lowest rounded-xl p-8 space-y-6 transform md:translate-y-8">
        <div class="w-14 h-14 bg-secondary-container flex items-center justify-center rounded-xl">
          <span class="material-symbols-outlined text-on-secondary-container text-3xl">${iconMap[prog3.type] || 'groups'}</span>
        </div>
        <h3 class="font-headline text-2xl font-bold text-primary">${escapeHtml(prog3.title)}</h3>
        <p class="text-on-surface-variant">${escapeHtml(prog3.description)}</p>
        <div class="pt-4 border-t border-outline-variant/30 flex items-center gap-3">
          <span class="material-symbols-outlined text-secondary">schedule</span>
          <span class="text-sm font-semibold">${escapeHtml(prog3.schedule)}</span>
        </div>
      </div>
    `;
  }

  async function fetchHomeGallery() {
    try {
      const data = await apiRequest('/gallery?limit=4');
      renderHomeGallery(data.items || []);
    } catch (error) {
      console.error('Failed to load gallery:', error);
    }
  }

  function renderHomeGallery(images) {
    const container = document.getElementById('gallery-preview');
    if (!container) return;
    if (!images || images.length < 4) {
      container.innerHTML = '<p class="col-span-12 text-center text-on-surface-variant">Gallery coming soon.</p>';
      return;
    }

    const [img1, img2, img3, img4] = images;
    container.innerHTML = `
      <div class="col-span-12 md:col-span-4 h-full">
        <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${escapeHtml(img1.url)}" alt="${escapeHtml(img1.caption)}">
      </div>
      <div class="col-span-12 md:col-span-8 grid grid-cols-2 gap-4">
        <div class="h-full">
          <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${escapeHtml(img2.url)}" alt="${escapeHtml(img2.caption)}">
        </div>
        <div class="h-full grid grid-rows-2 gap-4">
          <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${escapeHtml(img3.url)}" alt="${escapeHtml(img3.caption)}">
          <img class="w-full h-full object-cover rounded-xl shadow-lg" src="${escapeHtml(img4.url)}" alt="${escapeHtml(img4.caption)}">
        </div>
      </div>
    `;
  }

  async function initProgramsPublic() {
    await Promise.all([
      fetchUpcomingPrograms(),
      fetchPastPrograms(),
      fetchWeeklySchedule()
    ]);
  }

  async function fetchUpcomingPrograms() {
    try {
      const data = await apiRequest('/programs?status=upcoming');
      renderUpcomingPrograms(data);
    } catch (error) {
      console.error('Failed to load upcoming programs:', error);
    }
  }

  function renderUpcomingPrograms(programs) {
    const container = document.getElementById('upcoming-programs-container');
    if (!container) return;
    if (!programs || programs.length === 0) {
      container.innerHTML = '<p class="text-center py-8 text-on-surface-variant">No upcoming programs scheduled.</p>';
      return;
    }

    let html = '';
    programs.slice(0, 5).forEach(prog => {
      const isHighlighted = prog.is_main_service;
      const startDate = prog.start_datetime || prog.startDatetime || prog.date;
      const date = new Date(startDate);
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const day = date.getDate();
      const schedule = prog.schedule || formatTime(startDate);
      
      html += `
        <div class="group ${isHighlighted ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest'} p-8 rounded-xl flex flex-col md:flex-row gap-8 transition-all hover:shadow-xl ${isHighlighted ? 'relative overflow-hidden' : ''}">
          ${isHighlighted ? '<div class="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4"><span class="material-symbols-outlined text-[10rem]">nightlight</span></div>' : ''}
          <div class="flex-shrink-0 flex flex-col items-center justify-center ${isHighlighted ? 'bg-secondary text-on-secondary' : 'bg-secondary-container text-on-secondary-container'} rounded-2xl w-24 h-24 ${isHighlighted ? 'z-10' : ''}">
            <span class="text-sm font-bold">${month}</span>
            <span class="text-3xl font-black">${day}</span>
          </div>
          <div class="flex-1 ${isHighlighted ? 'z-10' : ''}">
            <div class="flex flex-wrap items-center gap-3 mb-2">
              <span class="${isHighlighted ? 'bg-on-primary/20 text-white' : 'bg-primary-container text-on-primary-container'} text-xs font-bold px-3 py-1 rounded-full">${escapeHtml(prog.type)}</span>
              <span class="${isHighlighted ? 'text-on-primary/70' : 'text-on-surface-variant'} text-sm flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">schedule</span> ${escapeHtml(schedule || '—')}
              </span>
            </div>
            <h3 class="text-2xl font-bold ${isHighlighted ? '' : 'text-primary'} mb-3">${escapeHtml(prog.title)}</h3>
            <p class="${isHighlighted ? 'text-on-primary/80' : 'text-on-surface-variant'} leading-relaxed">${escapeHtml(prog.description)}</p>
          </div>
          <div class="flex items-center ${isHighlighted ? 'z-10' : ''}">
            <button class="${isHighlighted ? 'bg-secondary text-on-secondary px-6 py-3 rounded-xl font-bold hover:scale-105' : 'text-primary font-bold hover:underline'} transition-transform">Details</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  async function fetchPastPrograms() {
    try {
      const data = await apiRequest('/programs?status=past&limit=4');
      renderPastPrograms(data);
    } catch (error) {
      console.error('Failed to load past programs:', error);
    }
  }

  function renderPastPrograms(programs) {
    const container = document.getElementById('past-highlights-container');
    if (!container) return;
    if (!programs || programs.length === 0) {
      container.innerHTML = '<p class="col-span-2 text-on-surface-variant">No past highlights.</p>';
      return;
    }

    let html = '';
    programs.forEach(prog => {
      const desc = typeof prog.description === 'string' ? prog.description : '';
      html += `
        <div class="bg-surface-container-low p-6 rounded-xl group hover:bg-surface-container-high transition-colors">
          <div class="text-on-surface-variant text-xs font-bold mb-2">${formatDate(prog.start_datetime || prog.startDatetime || prog.date).toUpperCase()}</div>
          <h4 class="text-xl font-bold text-primary mb-2">${escapeHtml(prog.title)}</h4>
          <p class="text-on-surface-variant text-sm mb-4">${escapeHtml(desc.substring(0, 80))}${desc.length > 80 ? '...' : ''}</p>
          <a href="/programs" class="text-secondary font-bold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
            Watch Replay <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </a>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  async function fetchWeeklySchedule() {
    try {
      const data = await apiRequest('/programs/weekly-schedule');
      renderWeeklySchedule(data);
    } catch (error) {
      console.error('Failed to load weekly schedule:', error);
    }
  }

  function renderWeeklySchedule(schedule) {
    const container = document.getElementById('weekly-schedule-container');
    if (!container || !schedule) return;
    
    let html = '';
    schedule.forEach(item => {
      const start = item.start_time || item.startTime || '';
      const end = item.end_time || item.endTime || '';
      const time = end ? `${start} - ${end}` : start;
      html += `
        <li class="flex justify-between items-start">
          <div>
            <span class="font-bold text-primary block">${escapeHtml(item.day_of_week || item.day || '')}</span>
            <span class="text-sm text-on-surface-variant italic">${escapeHtml(item.program_name || item.name || '')}</span>
          </div>
          <span class="text-sm font-bold text-secondary">${escapeHtml(time || '—')}</span>
        </li>
      `;
    });
    container.innerHTML = html;
  }

  // Gallery Page (Public)
  async function initGalleryPublic() {
    let currentPage = 1;
    const container = document.getElementById('gallery-grid');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    async function loadGallery(page = 1) {
      try {
        const data = await apiRequest(`/gallery?page=${page}&limit=8`);
        renderGalleryGrid(data.items, page === 1);
        if (!data.hasMore && loadMoreBtn) {
          loadMoreBtn.style.display = 'none';
        }
      } catch (error) {
        console.error('Failed to load gallery:', error);
      }
    }
    
    function renderGalleryGrid(images, replace = true) {
      if (!container) return;
      
      // Create bento grid layout
      let html = replace ? '' : container.innerHTML;
      images.forEach((img, index) => {
        let colSpan = 'md:col-span-4';
        let rowSpan = '';
        if (index === 0) {
          colSpan = 'md:col-span-8';
        } else if (index === 3) {
          colSpan = 'md:col-span-6';
        }
        
        html += `
          <div class="${colSpan} group relative overflow-hidden rounded-xl bg-surface-container-low ${index === 0 ? 'aspect-[16/9]' : 'aspect-square md:aspect-auto'}">
            <img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src="${escapeHtml(img.url)}" alt="${escapeHtml(img.caption)}">
            <div class="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex flex-col justify-end p-6">
              <span class="text-secondary-fixed text-xs font-bold uppercase tracking-widest mb-1">${escapeHtml(img.category || 'Gallery')}</span>
              <h3 class="text-white text-xl font-bold font-headline">${escapeHtml(img.caption)}</h3>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    }
    
    await loadGallery();
    
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        currentPage++;
        await loadGallery(currentPage);
      });
    }
  }

  // Announcements Page (Public)
  async function initAnnouncementsPublic() {
    let currentPage = 1;
    let currentCategory = 'all';
    const grid = document.getElementById('announcements-grid');
    const loadMoreBtn = document.getElementById('load-more-announcements');
    const searchInput = document.getElementById('announcement-search');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    async function loadAnnouncements(page = 1, category = 'all', search = '') {
      try {
        let url = `/announcements?page=${page}&limit=6`;
        if (category !== 'all') url += `&category=${category}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const data = await apiRequest(url);
        renderAnnouncementsGrid(data.items, page === 1);
        
        if (!data.hasMore && loadMoreBtn) {
          loadMoreBtn.style.display = 'none';
        } else if (loadMoreBtn) {
          loadMoreBtn.style.display = 'flex';
        }
      } catch (error) {
        console.error('Failed to load announcements:', error);
      }
    }
    
    function renderAnnouncementsGrid(items, replace = true) {
      if (!grid) return;
      
      let html = replace ? '' : grid.innerHTML;
      items.forEach((item, index) => {
        if (index === 0 && replace) {
          html += `
            <article class="md:col-span-8 group relative overflow-hidden rounded-xl bg-surface-container-lowest editorial-shadow">
                <div class="flex flex-col md:flex-row h-full">
                  <div class="md:w-1/2 overflow-hidden h-64 md:h-full">
                  <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="${escapeHtml(item.image_url || '/images/placeholder.svg')}" alt="${escapeHtml(item.title)}">
                </div>
                <div class="md:w-1/2 p-10 flex flex-col justify-between">
                  <div>
                    <div class="flex items-center gap-3 mb-6">
                      <span class="bg-secondary-container text-on-secondary-container px-3 py-1 rounded text-xs font-bold">FEATURED</span>
                      <span class="text-outline text-xs font-medium">${formatDate(item.created_at).toUpperCase()}</span>
                    </div>
                    <h2 class="text-3xl font-headline text-primary mb-4">${escapeHtml(item.title)}</h2>
                    <p class="text-on-surface-variant leading-relaxed mb-6">${escapeHtml(item.summary)}</p>
                  </div>
                  <a href="/announcements/${item.id}" class="inline-flex items-center gap-2 text-primary font-bold hover:gap-4 transition-all">Read Full Story <span class="material-symbols-outlined">arrow_forward</span></a>
                </div>
              </div>
            </article>
          `;
        } else {
          html += `
            <article class="md:col-span-4 bg-surface-container-low p-8 rounded-xl hover:bg-surface-container-high transition-colors group">
              <span class="text-secondary font-bold text-xs tracking-widest uppercase mb-4 block">${escapeHtml(item.category)}</span>
              <h3 class="text-xl font-headline text-primary mb-3">${escapeHtml(item.title)}</h3>
              <p class="text-on-surface-variant text-sm leading-relaxed mb-6">${escapeHtml(item.summary)}</p>
              <div class="flex items-center justify-between">
                <span class="text-xs text-outline font-medium">${formatDate(item.created_at).toUpperCase()}</span>
                <a href="/announcements/${item.id}" class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary editorial-shadow">
                  <span class="material-symbols-outlined text-sm">open_in_new</span>
                </a>
              </div>
            </article>
          `;
        }
      });
      grid.innerHTML = html;
    }
    
    await loadAnnouncements();
    
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        currentPage++;
        await loadAnnouncements(currentPage, currentCategory, searchInput?.value || '');
      });
    }
    
    if (filterBtns) {
      filterBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
          filterBtns.forEach(b => {
            b.classList.remove('bg-primary', 'text-on-primary');
            b.classList.add('bg-surface-container-low', 'text-on-surface-variant');
          });
          btn.classList.remove('bg-surface-container-low', 'text-on-surface-variant');
          btn.classList.add('bg-primary', 'text-on-primary');
          
          currentCategory = btn.dataset.category;
          currentPage = 1;
          await loadAnnouncements(1, currentCategory, searchInput?.value || '');
        });
      });
    }
    
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          currentPage = 1;
          await loadAnnouncements(1, currentCategory, searchInput.value);
        }, 500);
      });
    }
  }

  async function initAnnouncementDetails(announcementId) {
    if (!announcementId) return;
    try {
      const data = await apiRequest(`/announcements/${announcementId}`);
      const titleEl = document.getElementById('announcement-title');
      const dateEl = document.getElementById('announcement-date');
      const catEl = document.getElementById('announcement-category');
      const imgEl = document.getElementById('announcement-image');
      const summaryEl = document.getElementById('announcement-summary');
      const contentEl = document.getElementById('announcement-content');

      if (titleEl) titleEl.textContent = data.title || 'Announcement';
      if (dateEl) dateEl.textContent = data.created_at ? formatDate(data.created_at, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
      if (catEl) catEl.textContent = data.category || 'General';
      if (summaryEl) summaryEl.textContent = data.summary || '';
      if (imgEl) imgEl.src = data.image_url || '/images/placeholder.svg';
      if (contentEl) contentEl.textContent = data.content || '';
    } catch (error) {
      console.error('Failed to load announcement:', error);
      showToast('Failed to load announcement', 'error');
    }
  }

  function initContact() {
    const form = document.getElementById('contact-form');
    if (!form) return;
    
    // Load church info
    async function loadChurchInfo() {
      try {
        const data = await apiRequest('/church/info');
        document.getElementById('church-phone').textContent = data.phone;
        document.getElementById('church-email').textContent = data.email;
        document.getElementById('church-address').innerHTML = escapeHtml(data.address).replace(/\n/g, '<br>');
      } catch (error) {
        console.error('Failed to load church info:', error);
      }
    }
    
    loadChurchInfo();
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const statusDiv = document.getElementById('form-status');
      
      try {
        await apiRequest('/contact/send', {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(formData))
        });
        statusDiv.textContent = 'Message sent successfully! We\'ll respond within 24 hours.';
        statusDiv.className = 'text-sm text-green-700 p-3 bg-green-100 rounded-lg';
        form.reset();
      } catch (error) {
        statusDiv.textContent = error.message || 'Failed to send message. Please try again.';
        statusDiv.className = 'text-sm text-error p-3 bg-error-container/20 rounded-lg';
      }
      statusDiv.classList.remove('hidden');
    });
  }

  
  // Login
  function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    
    const errorDiv = document.getElementById('login-error');
    const errorTitle = document.getElementById('login-error-title');
    const errorMessage = document.getElementById('login-error-message');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const remember = document.getElementById('remember')?.checked;
      
      try {
        await login(email, password, remember);
        window.location.href = '/admin/dashboard';
      } catch (error) {
        errorTitle.textContent = 'Authentication Failed';
        errorMessage.textContent = error.message;
        errorDiv.classList.remove('hidden');
      }
    });
  }

  // Forgot Password
  function initForgotPassword() {
    const form = document.getElementById('forgot-password-form');
    if (!form) return;
    
    const statusDiv = document.getElementById('forgot-password-status');
    const toast = document.getElementById('notification-toast');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value;
      
      try {
        await apiRequest('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        
        statusDiv.textContent = 'OTP sent! Redirecting...';
        statusDiv.className = 'p-4 rounded-xl bg-green-100 text-green-700 text-sm';
        statusDiv.classList.remove('hidden');
        
        sessionStorage.setItem('resetEmail', email);
        setTimeout(() => {
          window.location.href = '/admin/verify-otp';
        }, 1500);
      } catch (error) {
        statusDiv.textContent = error.message;
        statusDiv.className = 'p-4 rounded-xl bg-error-container/20 text-error text-sm';
        statusDiv.classList.remove('hidden');
      }
    });
  }

  // Verify OTP
  function initVerifyOTP() {
    const form = document.getElementById('otp-form');
    if (!form) return;
    
    const inputs = document.querySelectorAll('.otp-input');
    const statusDiv = document.getElementById('otp-status');
    const timerDisplay = document.getElementById('timer-display');
    const resendBtn = document.getElementById('resend-btn');
    const contactMask = document.getElementById('contact-mask');
    
    const email = sessionStorage.getItem('resetEmail');
    if (email && contactMask) {
      contactMask.textContent = email;
    }
    
    // Auto-focus and combine OTP
    inputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
        // Combine all values into hidden field
        const otp = Array.from(inputs).map(i => i.value).join('');
        document.getElementById('otp-combined').value = otp;
      });
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          inputs[index - 1].focus();
        }
      });
    });
    
    // Countdown timer (2 minutes)
    let timeLeft = 120;
    function updateTimer() {
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        resendBtn.disabled = false;
        resendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      timeLeft--;
    }
    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const otp = document.getElementById('otp-combined').value;
      
      try {
        await apiRequest('/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ email, otp })
        });
        window.location.href = '/admin/reset-password';
      } catch (error) {
        statusDiv.textContent = error.message;
        statusDiv.className = 'p-3 rounded-lg text-sm bg-error-container/20 text-error';
        statusDiv.classList.remove('hidden');
      }
    });
    
    resendBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/auth/resend-otp', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        timeLeft = 120;
        resendBtn.disabled = true;
        resendBtn.classList.add('opacity-50', 'cursor-not-allowed');
        showToast('New OTP sent!', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  // Reset Password
  function initResetPassword() {
    const form = document.getElementById('reset-password-form');
    if (!form) return;
    
    const newPass = document.getElementById('new_password');
    const confirmPass = document.getElementById('confirm_password');
    const statusDiv = document.getElementById('reset-status');
    const strengthBars = ['strength-bar-1', 'strength-bar-2', 'strength-bar-3', 'strength-bar-4'];
    const strengthText = document.getElementById('strength-text');
    const matchHint = document.getElementById('password-match-hint');
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    document.getElementById('reset-token').value = token || '';
    
    // Password strength checker
    newPass.addEventListener('input', () => {
      const val = newPass.value;
      let strength = 0;
      if (val.length >= 8) strength++;
      if (/[A-Z]/.test(val)) strength++;
      if (/[0-9]/.test(val)) strength++;
      if (/[^A-Za-z0-9]/.test(val)) strength++;
      
      strengthBars.forEach((id, i) => {
        const bar = document.getElementById(id);
        if (i < strength) {
          bar.classList.remove('bg-surface-container-highest');
          bar.classList.add(i === 0 ? 'bg-error' : i === 1 ? 'bg-yellow-600' : 'bg-green-600');
        } else {
          bar.classList.remove('bg-error', 'bg-yellow-600', 'bg-green-600');
          bar.classList.add('bg-surface-container-highest');
        }
      });
      
      const messages = ['Weak', 'Fair', 'Good', 'Strong'];
      strengthText.textContent = strength > 0 ? `Strength: ${messages[strength-1]}` : 'Enter a password';
    });
    
    confirmPass.addEventListener('input', () => {
      if (confirmPass.value !== newPass.value) {
        matchHint.classList.remove('hidden');
      } else {
        matchHint.classList.add('hidden');
      }
    });
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (newPass.value !== confirmPass.value) {
        matchHint.classList.remove('hidden');
        return;
      }
      
      try {
        await apiRequest('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            token: document.getElementById('reset-token').value,
            newPassword: newPass.value
          })
        });
        statusDiv.textContent = 'Password reset successful! Redirecting to login...';
        statusDiv.className = 'p-4 rounded-xl bg-green-100 text-green-700 text-sm';
        statusDiv.classList.remove('hidden');
        setTimeout(() => {
          window.location.href = '/admin/login';
        }, 2000);
      } catch (error) {
        statusDiv.textContent = error.message;
        statusDiv.className = 'p-4 rounded-xl bg-error-container/20 text-error text-sm';
        statusDiv.classList.remove('hidden');
      }
    });
  }

  
  async function initDashboard() {
    if (!requireAuth()) return;
    
    await Promise.all([
      loadDashboardStats(),
      loadDonationChart(),
      loadRecentActivity(),
      loadUpcomingEvent()
    ]);
    
    // Set admin name
    if (currentUser) {
      document.getElementById('admin-name').textContent = currentUser.name;
      document.getElementById('admin-display-name').textContent = currentUser.name;
    }
    
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Quick finance (dashboard modal)
    document.getElementById('quick-finance')?.addEventListener('click', async () => {
      try {
        const recent = await apiRequest('/finance/transactions?page=1&limit=5');
        const items = (recent && recent.items) ? recent.items : [];
        const recentHtml = items.length === 0
          ? '<div class="text-sm text-on-surface-variant">No recent transactions yet.</div>'
          : `
            <div class="space-y-2">
              ${items.map(tx => `
                <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
                  <div class="min-w-0">
                    <div class="text-xs font-black text-on-surface-variant">${formatDate(tx.date)} • ${escapeHtml(tx.category || tx.type || 'Transaction')}</div>
                    <div class="text-sm font-semibold text-primary truncate">${escapeHtml(tx.description || tx.reference || '')}</div>
                  </div>
                  <div class="text-sm font-black ${tx.type === 'income' ? 'text-primary' : 'text-error'}">
                    ${tx.type === 'expense' ? '-' : ''}${formatCurrency(tx.amount)}
                  </div>
                </div>
              `).join('')}
            </div>
          `;

        openModal({
          title: 'Finance Update',
          submitLabel: 'Add Transaction',
          contentHtml: `
            <div>
              <div class="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Recent updates</div>
              ${recentHtml}
            </div>
            <div class="h-px bg-outline-variant/20 my-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Type</label>
                <select name="type" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Category</label>
                <input name="category" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="e.g., Tithe" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Amount (NGN)</label>
                <input name="amount" type="number" min="0" step="0.01" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Transaction Date</label>
                <input name="transaction_date" type="date" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Payment Method</label>
                <select name="payment_method" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile">Mobile</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Status</label>
                <select name="status" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="text-xs font-bold text-on-surface-variant">Description</label>
                <input name="description" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="Optional note" />
              </div>
            </div>
          `,
          onSubmit: async (fd, close) => {
            const payload = Object.fromEntries(fd.entries());
            try {
              await apiRequest('/finance/transactions', { method: 'POST', body: JSON.stringify(payload) });
              showToast('Transaction created', 'success');
              close();
              await Promise.all([loadDashboardStats(), loadDonationChart(), loadRecentActivity()]);
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
        });
      } catch (e) {
        showToast('Failed to load finance updates', 'error');
      }
    });
  }

  async function loadDashboardStats() {
    try {
      const data = await apiRequest('/dashboard/stats');
      document.getElementById('total-members').textContent = data.totalMembers.toLocaleString();
      document.getElementById('members-change').textContent = `+${data.newMembersThisMonth}`;
      document.getElementById('monthly-donations').textContent = formatCurrency(data.monthlyDonations);
      document.getElementById('donations-change').textContent = `+${data.donationsChange}%`;
      document.getElementById('monthly-expenses').textContent = formatCurrency(data.monthlyExpenses);
      document.getElementById('expenses-change').textContent = `${data.expensesChange}%`;
      document.getElementById('upcoming-events-count').textContent = data.upcomingEvents;
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    }
  }

  async function loadDonationChart() {
    try {
      const data = await apiRequest('/dashboard/donation-trends');
      const container = document.getElementById('donation-chart-container');
      const labelsContainer = document.getElementById('chart-labels');
      if (!container) return;
      
      const max = Math.max(...data.values);
      let barsHtml = '';
      let labelsHtml = '';
      
      data.labels.forEach((label, i) => {
        const height = (data.values[i] / max) * 100;
        barsHtml += `
          <div class="flex-1 bg-primary/10 rounded-t-lg relative group h-[${height}%] transition-all hover:bg-primary/20">
            <div class="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">${formatCurrency(data.values[i])}</div>
          </div>
        `;
        labelsHtml += `<span>${label}</span>`;
      });
      
      container.innerHTML = `
        <div class="absolute inset-0 flex flex-col justify-between opacity-10">
          <div class="border-b border-primary w-full"></div>
          <div class="border-b border-primary w-full"></div>
          <div class="border-b border-primary w-full"></div>
          <div class="border-b border-primary w-full"></div>
        </div>
        <div class="relative h-full flex items-end justify-between gap-4">
          ${barsHtml}
        </div>
      `;
      labelsContainer.innerHTML = labelsHtml;
    } catch (error) {
      console.error('Failed to load donation chart:', error);
    }
  }

  async function loadRecentActivity() {
    try {
      const data = await apiRequest('/dashboard/recent-activity');
      const container = document.getElementById('activity-feed');
      if (!container) return;
      
      let html = '';
      data.forEach(activity => {
        const iconMap = {
          'member_joined': 'person_add',
          'tithe': 'volunteer_activism',
          'expense': 'receipt',
          'event': 'event'
        };
        const createdAt = activity.created_at || activity.createdAt || activity.created || activity.date || null;
        html += `
          <div class="px-8 py-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-full bg-primary-fixed/20 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined">${iconMap[activity.type] || 'notifications'}</span>
              </div>
              <div>
                <p class="text-sm font-bold text-primary">${escapeHtml(activity.title)}</p>
                <p class="text-xs text-on-surface-variant">${escapeHtml(activity.description)}</p>
              </div>
            </div>
            <span class="text-xs text-on-surface-variant font-medium">${timeAgo(createdAt)}</span>
          </div>
        `;
      });
      container.innerHTML = html;
    } catch (error) {
      console.error('Failed to load recent activity:', error);
    }
  }

  async function loadUpcomingEvent() {
    try {
      const data = await apiRequest('/dashboard/upcoming-event');
      const container = document.getElementById('upcoming-event-card');
      if (!container) return;
      
      container.innerHTML = `
        <h3 class="text-2xl font-black mb-2">${escapeHtml(data.title)}</h3>
        <div class="flex items-center gap-2 text-sm text-on-primary-container font-semibold mb-6">
          <span class="material-symbols-outlined text-sm">calendar_today</span>
          ${data.date ? formatDate(data.date, { weekday: 'long', month: 'long', day: 'numeric' }) : '—'}
        </div>
        <a href="/admin/programs" class="bg-secondary-fixed text-on-secondary-fixed w-full py-3 rounded-xl font-bold hover:opacity-90 transition-opacity inline-block text-center">
          Manage Event
        </a>
      `;
    } catch (error) {
      console.error('Failed to load upcoming event:', error);
    }
  }
  
  async function initMembers() {
    if (!requireAuth()) return;
    
    let currentPage = 1;
    const tableBody = document.getElementById('members-table-body');
    const searchInput = document.getElementById('member-search');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');
    
    async function loadMembers(page = 1, search = '') {
      try {
        const data = await apiRequest(`/members?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
        renderMembersTable(data.items);
        updatePagination(data);
        await loadMembersStats();
      } catch (error) {
        console.error('Failed to load members:', error);
      }
    }
    
    function renderMembersTable(members) {
      if (!tableBody) return;
      
      let html = '';
      members.forEach(member => {
        html += `
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="px-6 py-5 flex items-center gap-3">
              <div class="w-10 h-10 rounded-full overflow-hidden bg-primary-fixed">
                <img class="w-full h-full object-cover" src="${escapeHtml(member.avatar || '/images/default-avatar.svg')}" alt="${escapeHtml(member.name)}">
              </div>
              <div>
                <p class="font-bold text-primary">${escapeHtml(member.name)}</p>
                <p class="text-xs text-on-surface-variant">${escapeHtml(member.member_type)}</p>
              </div>
            </td>
            <td class="px-6 py-5 text-on-surface-variant font-medium">${escapeHtml(member.phone)}</td>
            <td class="px-6 py-5 text-on-surface-variant">${escapeHtml(member.email)}</td>
            <td class="px-6 py-5">
              <span class="bg-primary-container/10 text-primary-container text-[10px] font-bold px-2 py-1 rounded-full">${escapeHtml(member.department || '—')}</span>
            </td>
            <td class="px-6 py-5 text-on-surface-variant">${formatDate(member.joined_date)}</td>
            <td class="px-6 py-5">
              <div class="flex justify-center gap-3">
                <a href="/admin/members/${member.id}" class="p-2 text-primary hover:bg-primary-fixed/30 rounded-lg transition-colors"><span class="material-symbols-outlined text-xl">visibility</span></a>
                <button data-id="${member.id}" class="edit-member p-2 text-secondary hover:bg-secondary-fixed/30 rounded-lg transition-colors"><span class="material-symbols-outlined text-xl">edit</span></button>
                <button data-id="${member.id}" class="delete-member p-2 text-error hover:bg-error-container/30 rounded-lg transition-colors"><span class="material-symbols-outlined text-xl">delete</span></button>
              </div>
            </td>
          </tr>
        `;
      });
      tableBody.innerHTML = html;
      
      // Attach event listeners
      document.querySelectorAll('.delete-member').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Are you sure you want to delete this member?')) {
            try {
              await apiRequest(`/members/${btn.dataset.id}`, { method: 'DELETE' });
              loadMembers(currentPage, searchInput?.value || '');
              showToast('Member deleted', 'success');
            } catch (error) {
              showToast(error.message, 'error');
            }
          }
        });
      });
    }
    
    function updatePagination(data) {
      if (paginationInfo) {
        paginationInfo.textContent = `Showing ${data.from} to ${data.to} of ${data.total} members`;
      }
      if (paginationControls) {
        let html = `
          <button class="w-10 h-10 flex items-center justify-center rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-colors" ${data.page === 1 ? 'disabled' : ''} data-page="${data.page - 1}">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
        `;
        for (let i = 1; i <= data.totalPages; i++) {
          if (i === 1 || i === data.totalPages || (i >= data.page - 2 && i <= data.page + 2)) {
            html += `
              <button class="w-10 h-10 flex items-center justify-center rounded-xl ${i === data.page ? 'bg-primary text-on-primary' : 'border border-outline-variant/20 hover:bg-surface-container-low'} font-bold" data-page="${i}">${i}</button>
            `;
          } else if (i === data.page - 3 || i === data.page + 3) {
            html += `<span class="px-2">...</span>`;
          }
        }
        html += `
          <button class="w-10 h-10 flex items-center justify-center rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-colors" ${data.page === data.totalPages ? 'disabled' : ''} data-page="${data.page + 1}">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        `;
        paginationControls.innerHTML = html;
        
        paginationControls.querySelectorAll('button[data-page]').forEach(btn => {
          btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page) && page !== currentPage) {
              currentPage = page;
              loadMembers(currentPage, searchInput?.value || '');
            }
          });
        });
      }
    }
    
    async function loadMembersStats() {
      try {
        const data = await apiRequest('/members/stats');
        document.getElementById('total-members-stat').textContent = data.total;
        document.getElementById('new-members-this-month').textContent = `+${data.newThisMonth} this month`;
        document.getElementById('active-tithers-count').textContent = data.activeTithers;
        document.getElementById('tithers-progress-bar').style.width = `${data.tithersPercentage}%`;
        document.getElementById('departments-count').textContent = data.departments;
        document.getElementById('upcoming-baptisms-count').textContent = data.upcomingBaptisms;
      } catch (error) {
        console.error('Failed to load member stats:', error);
      }
    }
    
    await loadMembers();
    
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          currentPage = 1;
          loadMembers(1, searchInput.value);
        }, 500);
      });
    }
    
    document.getElementById('add-member-btn')?.addEventListener('click', () => {
      openModal({
        title: 'Add Member',
        submitLabel: 'Create',
        contentHtml: `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-on-surface-variant">First Name</label>
              <input name="first_name" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Last Name</label>
              <input name="last_name" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Email</label>
              <input name="email" type="email" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Phone</label>
              <input name="phone" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Department</label>
              <input name="department" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="e.g., Choir" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Member Type</label>
              <select name="member_type" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                <option value="adult">Adult</option>
                <option value="youth">Youth</option>
                <option value="child">Child</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-on-surface-variant">Address</label>
              <input name="address" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-on-surface-variant">Photo (optional)</label>
              <input name="avatar" type="file" accept="image/*" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-surface-container-highest file:text-primary file:font-bold" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Joined Date</label>
              <input name="joined_date" type="date" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div class="flex items-center gap-3 mt-6">
              <input id="baptism_status" name="baptism_status" type="checkbox" class="rounded-md border-outline-variant/40" />
              <label for="baptism_status" class="text-sm font-semibold text-on-surface-variant">Baptized</label>
            </div>
          </div>
        `,
        onSubmit: async (formData, close) => {
          const avatarFile = formData.get('avatar');
          const payload = Object.fromEntries(Array.from(formData.entries()).filter(([k]) => k !== 'avatar'));
          payload.baptism_status = payload.baptism_status === 'on';
          try {
            const created = await apiRequest('/members', { method: 'POST', body: JSON.stringify(payload) });
            if (avatarFile && avatarFile instanceof File && avatarFile.size > 0) {
              const fd = new FormData();
              fd.append('avatar', avatarFile);
              await apiRequest(`/members/${created.id}/avatar`, { method: 'POST', body: fd });
            }
            showToast('Member created', 'success');
            close();
            currentPage = 1;
            await loadMembers(1, searchInput?.value || '');
          } catch (error) {
            showToast(error.message, 'error');
          }
        }
      });
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  async function initMemberDetails(memberId) {
    if (!requireAuth()) return;
    if (!memberId) return;

    try {
      const data = await apiRequest(`/members/${memberId}/profile`);
      const member = data.member || {};

      const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Member';
      document.getElementById('member-name') && (document.getElementById('member-name').textContent = fullName);
      document.getElementById('member-email') && (document.getElementById('member-email').textContent = member.email || '—');
      document.getElementById('member-phone') && (document.getElementById('member-phone').textContent = member.phone || '—');
      document.getElementById('member-address') && (document.getElementById('member-address').textContent = member.address || '—');
      document.getElementById('member-birthday') && (document.getElementById('member-birthday').textContent = member.dob ? formatDate(member.dob) : '—');
      document.getElementById('member-role') && (document.getElementById('member-role').textContent = member.department || member.member_type || 'Member');
      if (document.getElementById('member-avatar')) {
        document.getElementById('member-avatar').src = member.avatar || '/images/default-avatar.svg';
      }

      // Avatar upload
      const avatarBtn = document.getElementById('upload-avatar-btn');
      if (avatarBtn) {
        avatarBtn.onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async () => {
            const file = input.files && input.files[0] ? input.files[0] : null;
            if (!file) return;
            const fd = new FormData();
            fd.append('avatar', file);
            try {
              const r = await apiRequest(`/members/${memberId}/avatar`, { method: 'POST', body: fd });
              document.getElementById('member-avatar').src = r.url;
              showToast('Photo updated', 'success');
            } catch (e) {
              showToast(e.message, 'error');
            }
          };
          input.click();
        };
      }

      if (document.getElementById('total-giving-ytd')) {
        document.getElementById('total-giving-ytd').textContent = formatCurrency(data.givingYtd || 0);
      }
      if (document.getElementById('attendance-rate')) {
        document.getElementById('attendance-rate').textContent = data.attendanceRate == null ? '--%' : `${data.attendanceRate}%`;
      }

      const txBody = document.getElementById('recent-transactions-body');
      if (txBody) {
        const rows = (data.recentTransactions || []).map(tx => `
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="py-4 pr-4 text-sm font-medium text-on-surface-variant">${formatDate(tx.date)}</td>
            <td class="py-4 pr-4 text-sm font-bold text-primary">${escapeHtml(tx.category || '—')}</td>
            <td class="py-4 pr-4 text-sm font-medium text-on-surface-variant">${escapeHtml(tx.method || '—')}</td>
            <td class="py-4 text-right text-sm font-black text-primary">${formatCurrency(tx.amount)}</td>
          </tr>
        `).join('');
        txBody.innerHTML = rows || '<tr><td class="py-6 text-sm text-on-surface-variant" colspan="4">No transactions yet.</td></tr>';
      }

      const chips = document.getElementById('attendance-chips');
      if (chips) {
        const items = (data.recentAttendance || []).map(a => {
          const ok = a.status === 'present';
          const bg = ok ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'bg-surface-container-highest text-on-surface-variant';
          return `
            <div class="px-4 py-3 rounded-xl ${bg} flex items-center gap-3">
              <span class="material-symbols-outlined text-base">${ok ? 'check_circle' : 'cancel'}</span>
              <div class="text-xs font-bold">
                <div>${formatDate(a.event_date)}</div>
                <div class="opacity-70 font-semibold">${escapeHtml(a.service_type || 'Service')}</div>
              </div>
            </div>
          `;
        }).join('');
        chips.innerHTML = items || '<p class="text-sm text-on-surface-variant">No attendance records.</p>';
      }

      // Household links
      const householdContainer = document.getElementById('household-members');
      async function loadHousehold() {
        if (!householdContainer) return;
        try {
          const links = await apiRequest(`/members/${memberId}/household`);
          if (!links || links.length === 0) {
            householdContainer.innerHTML = '<p class="text-sm text-on-surface-variant">No household members linked.</p>';
            return;
          }
          householdContainer.innerHTML = links.map(l => `
            <div class="flex items-center justify-between gap-4 p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-full overflow-hidden bg-primary-fixed flex-shrink-0">
                  <img class="w-full h-full object-cover" src="${escapeHtml(l.avatar || '/images/default-avatar.svg')}" alt="${escapeHtml(l.name)}">
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-black text-primary truncate">${escapeHtml(l.name)}</p>
                  <p class="text-xs text-on-surface-variant truncate">${escapeHtml(l.relationship || 'Household')}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <a href="/admin/members/${l.id}" class="p-2 rounded-lg bg-surface-container-highest hover:bg-surface-container-high transition-colors text-primary" title="View">
                  <span class="material-symbols-outlined">visibility</span>
                </a>
                <button type="button" data-household-remove="${l.id}" class="p-2 rounded-lg bg-error-container/30 hover:bg-error-container transition-colors text-error" title="Unlink">
                  <span class="material-symbols-outlined">link_off</span>
                </button>
              </div>
            </div>
          `).join('');

          householdContainer.querySelectorAll('button[data-household-remove]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const rid = btn.getAttribute('data-household-remove');
              if (!confirm('Remove this household link?')) return;
              try {
                await apiRequest(`/members/${memberId}/household/${rid}`, { method: 'DELETE' });
                showToast('Link removed', 'success');
                await loadHousehold();
              } catch (e) {
                showToast(e.message, 'error');
              }
            });
          });
        } catch (e) {
          householdContainer.innerHTML = '<p class="text-sm text-error">Failed to load household.</p>';
        }
      }

      await loadHousehold();

      document.getElementById('link-household-btn')?.addEventListener('click', () => {
        const { overlay } = openModal({
          title: 'Link Household Member',
          submitLabel: 'Link',
          contentHtml: `
            <input type="hidden" name="related_member_id" id="related-member-id" value="">
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Search member</label>
              <input id="household-search" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="Type at least 2 letters..." />
              <div id="household-results" class="mt-3 max-h-56 overflow-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest"></div>
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Relationship</label>
              <input name="relationship" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="e.g., Spouse, Child, Parent" required />
            </div>
            <p id="household-selected" class="text-xs font-bold text-primary hidden"></p>
          `,
          onSubmit: async (fd, close) => {
            const related_member_id = (fd.get('related_member_id') || '').toString();
            const relationship = (fd.get('relationship') || '').toString();
            if (!related_member_id) {
              showToast('Select a member first', 'error');
              return;
            }
            try {
              await apiRequest(`/members/${memberId}/household`, { method: 'POST', body: JSON.stringify({ related_member_id, relationship }) });
              showToast('Household link created', 'success');
              close();
              await loadHousehold();
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
        });

        const input = overlay.querySelector('#household-search');
        const results = overlay.querySelector('#household-results');
        const hidden = overlay.querySelector('#related-member-id');
        const selected = overlay.querySelector('#household-selected');

        const render = (items) => {
          if (!results) return;
          if (!items || items.length === 0) {
            results.innerHTML = '<div class="p-4 text-sm text-on-surface-variant">No matches.</div>';
            return;
          }
          results.innerHTML = items.map(m => `
            <button type="button" data-pick="${m.id}" class="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors flex items-center gap-3">
              <div class="w-9 h-9 rounded-full overflow-hidden bg-primary-fixed flex-shrink-0">
                <img class="w-full h-full object-cover" src="${escapeHtml(m.avatar || '/images/default-avatar.svg')}" alt="${escapeHtml(m.name)}">
              </div>
              <div class="min-w-0">
                <div class="text-sm font-black text-primary truncate">${escapeHtml(m.name)}</div>
                <div class="text-xs text-on-surface-variant truncate">${escapeHtml(m.email || m.phone || '')}</div>
              </div>
            </button>
          `).join('');

          results.querySelectorAll('button[data-pick]').forEach(b => {
            b.addEventListener('click', () => {
              const id = b.getAttribute('data-pick');
              const member = items.find(x => String(x.id) === String(id));
              hidden.value = id;
              if (selected && member) {
                selected.textContent = `Selected: ${member.name}`;
                selected.classList.remove('hidden');
              }
            });
          });
        };

        if (results) results.innerHTML = '<div class="p-4 text-sm text-on-surface-variant">Start typing to search.</div>';
        if (input) {
          let t;
          input.addEventListener('input', () => {
            clearTimeout(t);
            hidden.value = '';
            selected?.classList.add('hidden');
            t = setTimeout(async () => {
              const q = (input.value || '').trim();
              if (q.length < 2) {
                render([]);
                return;
              }
              try {
                const items = await apiRequest(`/members/lookup?search=${encodeURIComponent(q)}`);
                render(items);
              } catch (e) {
                results.innerHTML = '<div class="p-4 text-sm text-error">Search failed.</div>';
              }
            }, 300);
          });
        }
      });

      document.getElementById('edit-member-btn')?.addEventListener('click', () => {
        openModal({
          title: 'Edit Member',
          submitLabel: 'Update',
          contentHtml: `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-xs font-bold text-on-surface-variant">First Name</label>
                <input name="first_name" required value="${member.first_name || ''}" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Last Name</label>
                <input name="last_name" required value="${member.last_name || ''}" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Email</label>
                <input name="email" type="email" value="${member.email || ''}" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Phone</label>
                <input name="phone" value="${member.phone || ''}" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div class="md:col-span-2">
                <label class="text-xs font-bold text-on-surface-variant">Address</label>
                <input name="address" value="${member.address || ''}" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Department</label>
                <input name="department" value="${member.department || ''}" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-bold text-on-surface-variant">Member Type</label>
                <select name="member_type" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                  <option value="adult" ${member.member_type === 'adult' ? 'selected' : ''}>Adult</option>
                  <option value="youth" ${member.member_type === 'youth' ? 'selected' : ''}>Youth</option>
                  <option value="child" ${member.member_type === 'child' ? 'selected' : ''}>Child</option>
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="text-xs font-bold text-on-surface-variant">New Photo (optional)</label>
                <input name="avatar" type="file" accept="image/*" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-surface-container-highest file:text-primary file:font-bold" />
              </div>
            </div>
          `,
          onSubmit: async (formData, close) => {
            const avatarFile = formData.get('avatar');
            const payload = Object.fromEntries(Array.from(formData.entries()).filter(([k]) => k !== 'avatar'));
            try {
              await apiRequest(`/members/${memberId}`, { method: 'PUT', body: JSON.stringify(payload) });
              if (avatarFile && avatarFile instanceof File && avatarFile.size > 0) {
                const fd = new FormData();
                fd.append('avatar', avatarFile);
                await apiRequest(`/members/${memberId}/avatar`, { method: 'POST', body: fd });
              }
              showToast('Member updated', 'success');
              close();
              await initMemberDetails(memberId);
            } catch (error) {
              showToast(error.message, 'error');
            }
          }
        });
      });

      document.getElementById('logout-btn')?.addEventListener('click', logout);
    } catch (error) {
      console.error('Failed to load member profile:', error);
      showToast('Failed to load member profile', 'error');
    }
  }

  
  async function initFinance() {
    if (!requireAuth()) return;
    
    let currentPage = 1;
    const tableBody = document.getElementById('transactions-table-body');
    const searchInput = document.getElementById('transaction-search');
    
    async function loadFinanceData() {
      try {
        const [summary, transactions] = await Promise.all([
          apiRequest('/finance/summary'),
          apiRequest(`/finance/transactions?page=${currentPage}&limit=10`)
        ]);
        
        document.getElementById('available-balance').textContent = formatCurrency(summary.balance);
        document.getElementById('balance-change').innerHTML = `<span class="material-symbols-outlined text-xs">${summary.trend > 0 ? 'trending_up' : 'trending_down'}</span><span>${summary.trend > 0 ? '+' : ''}${summary.trend}% from last month</span>`;
        document.getElementById('monthly-tithes').textContent = formatCurrency(summary.monthlyTithes);
        document.getElementById('tithes-progress').style.width = `${summary.tithesProgress}%`;
        document.getElementById('total-expenses').textContent = formatCurrency(summary.monthlyExpenses);
        document.getElementById('expense-trend').innerHTML = `<span class="material-symbols-outlined text-sm">trending_down</span><span>${summary.expenseStatus}</span>`;
        
        renderTransactions(transactions.items);
        updatePagination(transactions);
      } catch (error) {
        console.error('Failed to load finance data:', error);
      }
    }
    
    function renderTransactions(transactions) {
      if (!tableBody) return;
      
      let html = '';
      transactions.forEach(tx => {
        const typeColor = tx.type === 'income' ? 'text-primary' : 'text-tertiary';
        const amountPrefix = tx.type === 'income' ? '' : '- ';
        const statusClasses = tx.status === 'completed'
          ? 'bg-primary-fixed text-on-primary-fixed-variant'
          : 'bg-surface-container-highest text-on-surface-variant';
        html += `
          <tr class="hover:bg-surface-container/50 transition-colors">
            <td class="px-6 py-5 text-sm font-medium text-on-surface-variant">${formatDate(tx.date)}</td>
            <td class="px-6 py-5">
              <span class="flex items-center gap-2 text-sm font-bold ${typeColor}">
                <span class="w-2 h-2 rounded-full ${tx.type === 'income' ? 'bg-secondary' : 'bg-tertiary'}"></span>
                ${escapeHtml(tx.category)}
              </span>
            </td>
            <td class="px-6 py-5 text-sm font-medium text-on-surface italic">${escapeHtml(tx.description)}</td>
            <td class="px-6 py-5">
              <span class="${statusClasses} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">${escapeHtml(tx.status)}</span>
            </td>
            <td class="px-6 py-5 text-right font-black ${typeColor}">${amountPrefix}${formatCurrency(tx.amount)}</td>
          </tr>
        `;
      });
      tableBody.innerHTML = html;
    }
    
    function updatePagination(data) {
      const info = document.getElementById('pagination-info');
      const controls = document.getElementById('pagination-controls');
      if (info) info.textContent = `Showing ${data.from} to ${data.to} of ${data.total} transactions`;
    }
    
    await loadFinanceData();
    
    document.getElementById('add-transaction-btn')?.addEventListener('click', () => {
      openModal({
        title: 'New Transaction',
        submitLabel: 'Create',
        contentHtml: `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Type</label>
              <select name="type" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Category</label>
              <input name="category" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="e.g., Tithe" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Amount (NGN)</label>
              <input name="amount" type="number" min="0" step="0.01" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Date</label>
              <input name="transaction_date" type="date" required class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Payment Method</label>
              <select name="payment_method" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mobile">Mobile</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-on-surface-variant">Status</label>
              <select name="status" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20">
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-on-surface-variant">Description</label>
              <input name="description" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="Optional note" />
            </div>
          </div>
        `,
        onSubmit: async (formData, close) => {
          const payload = Object.fromEntries(formData.entries());
          try {
            await apiRequest('/finance/transactions', { method: 'POST', body: JSON.stringify(payload) });
            showToast('Transaction created', 'success');
            close();
            await loadFinanceData();
          } catch (error) {
            showToast(error.message, 'error');
          }
        }
      });
    });
    
    document.getElementById('export-report-btn')?.addEventListener('click', async () => {
      try {
        const blob = await apiRequest('/finance/export', { method: 'GET', headers: { Accept: 'text/csv' }, parseAs: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transactions.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        showToast('Export failed', 'error');
      }
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  
  async function initProgramsAdmin() {
    if (!requireAuth()) return;

    let currentPage = 1;
    let currentCategory = 'all';
    let currentSearch = '';

    const tableBody = document.getElementById('programs-table-body');
    const searchInput = document.getElementById('program-search');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');
    const filterBtns = document.querySelectorAll('#category-filters .filter-btn');

    const modal = document.getElementById('program-modal');
    const form = document.getElementById('program-form');

    function open() {
      modal?.classList.remove('hidden');
    }
    function close() {
      modal?.classList.add('hidden');
      form?.reset();
      document.getElementById('program-id') && (document.getElementById('program-id').value = '');
    }

    async function loadStats() {
      try {
        const stats = await apiRequest('/admin/programs/stats');
        const active = (Number(stats.upcoming || 0) + Number(stats.ongoing || 0)) || Number(stats.total || 0) || 0;
        const el = document.getElementById('active-programs-count');
        if (el) el.textContent = active;
      } catch (_) {}
    }

    async function loadPrograms(page = 1) {
      currentPage = page;
      const q = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: currentSearch,
        category: currentCategory
      });
      try {
        const data = await apiRequest(`/admin/programs?${q.toString()}`);
        renderPrograms(data.items || []);
        if (paginationInfo) paginationInfo.textContent = `Showing ${data.from} to ${data.to} of ${data.total} programs`;
        renderPaginationControls(paginationControls, data.page, data.totalPages, (p) => loadPrograms(p));
        await loadStats();
      } catch (error) {
        console.error('Failed to load programs:', error);
        showToast(error.message, 'error');
      }
    }

    function renderPrograms(items) {
      if (!tableBody) return;
      tableBody.innerHTML = items.map(p => {
        const start = p.start_datetime ? new Date(p.start_datetime) : null;
        const schedule = start ? `${formatDate(start.toISOString())} â€¢ ${formatTime(start.toISOString())}` : '—';
        const statusColor =
          p.status === 'upcoming' ? 'bg-secondary-container text-on-secondary-container' :
          p.status === 'ongoing' ? 'bg-primary-fixed text-on-primary-fixed-variant' :
          p.status === 'completed' ? 'bg-surface-container-highest text-on-surface-variant' :
          'bg-error-container text-on-error-container';

        return `
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="px-6 py-5">
              <div class="flex flex-col">
                <span class="text-sm font-black text-primary">${escapeHtml(p.title)}</span>
                <span class="text-xs text-on-surface-variant">${escapeHtml(p.location || '—')} â€¢ ${escapeHtml(p.category || '—')}</span>
              </div>
            </td>
            <td class="px-6 py-5 text-sm font-bold text-primary">${escapeHtml((p.type || 'service').replaceAll('_', ' '))}</td>
            <td class="px-6 py-5 text-sm font-medium text-on-surface-variant">${schedule}</td>
            <td class="px-6 py-5">
              <span class="${statusColor} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">${escapeHtml(p.status || 'draft')}</span>
            </td>
            <td class="px-6 py-5 text-right">
              <div class="flex justify-end gap-2">
                <button data-action="edit" data-id="${p.id}" class="p-2 rounded-lg bg-surface-container-highest hover:bg-surface-container-high transition-colors text-primary">
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button data-action="delete" data-id="${p.id}" class="p-2 rounded-lg bg-error-container/30 hover:bg-error-container transition-colors text-error">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tableBody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            const program = await apiRequest(`/admin/programs/${id}`);
            document.getElementById('program-id').value = program.id;
            document.getElementById('program-title').value = program.title || '';
            document.getElementById('program-type').value = program.type || 'service';
            document.getElementById('program-category').value = program.category || 'Liturgical';
            document.getElementById('program-location').value = program.location || '';
            document.getElementById('program-description').value = program.description || '';
            document.getElementById('program-status').value = program.status || 'upcoming';
            document.getElementById('program-main-service').checked = Boolean(program.is_main_service);
            document.getElementById('program-featured').checked = Boolean(program.is_featured);

            if (program.start_datetime) {
              const dt = new Date(program.start_datetime);
              const yyyy = dt.getFullYear();
              const mm = String(dt.getMonth() + 1).padStart(2, '0');
              const dd = String(dt.getDate()).padStart(2, '0');
              const hh = String(dt.getHours()).padStart(2, '0');
              const mi = String(dt.getMinutes()).padStart(2, '0');
              document.getElementById('program-date').value = `${yyyy}-${mm}-${dd}`;
              document.getElementById('program-time').value = `${hh}:${mi}`;
            }
            open();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      tableBody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this program?')) return;
          try {
            await apiRequest(`/admin/programs/${id}`, { method: 'DELETE' });
            showToast('Program deleted', 'success');
            await loadPrograms(currentPage);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });
    }

    // Modal open buttons
    document.getElementById('new-program-sidebar-btn')?.addEventListener('click', open);
    document.getElementById('add-program-header-btn')?.addEventListener('click', open);
    document.getElementById('close-modal-btn')?.addEventListener('click', close);
    document.getElementById('cancel-modal-btn')?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    // Filters
    filterBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        filterBtns.forEach(b => b.classList.add('opacity-40'));
        btn.classList.remove('opacity-40');
        currentCategory = btn.dataset.category || 'all';
        await loadPrograms(1);
      });
    });

    if (searchInput) {
      let t;
      searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          currentSearch = searchInput.value || '';
          loadPrograms(1);
        }, 400);
      });
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const id = (fd.get('id') || '').toString();
      const date = (fd.get('date') || '').toString();
      const time = (fd.get('time') || '').toString();
      const start_datetime = date && time ? `${date} ${time}:00` : null;
      const payload = {
        title: (fd.get('title') || '').toString(),
        description: (fd.get('description') || '').toString(),
        type: (fd.get('type') || 'service').toString(),
        category: (fd.get('category') || '').toString(),
        location: (fd.get('location') || '').toString(),
        status: (fd.get('status') || 'upcoming').toString(),
        start_datetime,
        schedule: time || null,
        is_main_service: fd.get('is_main_service') === 'on',
        is_featured: fd.get('is_featured') === 'on'
      };
      if (!payload.title || !payload.start_datetime) {
        showToast('Title and start date/time are required', 'error');
        return;
      }

      try {
        if (id) {
          await apiRequest(`/admin/programs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Program updated', 'success');
        } else {
          await apiRequest('/admin/programs', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Program created', 'success');
        }
        close();
        await loadPrograms(1);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    await loadPrograms(1);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  
  async function initAnnouncementsAdmin() {
    if (!requireAuth()) return;

    let currentPage = 1;
    let currentSearch = '';

    const tableBody = document.getElementById('announcements-table-body');
    const searchInput = document.getElementById('announcement-search');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');

    const modal = document.getElementById('announcement-modal');
    const form = document.getElementById('announcement-form');
    const closeBtn = document.getElementById('close-modal-btn');

    const priorityBtns = document.querySelectorAll('#priority-selector .priority-btn');
    const priorityInput = document.getElementById('announcement-priority');

    let submitMode = 'publish'; 

    function open() {
      modal?.classList.remove('hidden');
    }
    function close() {
      modal?.classList.add('hidden');
      form?.reset();
      document.getElementById('announcement-id') && (document.getElementById('announcement-id').value = '');
      document.getElementById('announcement-priority') && (document.getElementById('announcement-priority').value = 'normal');
      document.getElementById('announcement-status') && (document.getElementById('announcement-status').value = 'draft');
      submitMode = 'publish';
    }

    function setPriority(v) {
      if (priorityInput) priorityInput.value = v;
      priorityBtns.forEach(b => {
        if (b.dataset.priority === v) {
          b.classList.add('bg-surface', 'text-primary', 'shadow-sm');
          b.classList.remove('text-on-surface-variant');
        } else {
          b.classList.remove('bg-surface', 'text-primary', 'shadow-sm');
          b.classList.add('text-on-surface-variant');
        }
      });
    }

    priorityBtns.forEach(btn => btn.addEventListener('click', () => setPriority(btn.dataset.priority || 'normal')));

    async function loadStats() {
      try {
        const s = await apiRequest('/admin/announcements/stats');
        document.getElementById('active-announcements-count') && (document.getElementById('active-announcements-count').textContent = s.published || 0);
        document.getElementById('draft-announcements-count') && (document.getElementById('draft-announcements-count').textContent = s.draft || 0);
        document.getElementById('scheduled-announcements-count') && (document.getElementById('scheduled-announcements-count').textContent = s.scheduled || 0);
        document.getElementById('total-reach-count') && (document.getElementById('total-reach-count').textContent = s.totalReach || 0);
      } catch (_) {}
    }

    async function loadAnnouncements(page = 1) {
      currentPage = page;
      const q = new URLSearchParams({ page: String(page), limit: '10', search: currentSearch });
      try {
        const data = await apiRequest(`/admin/announcements?${q.toString()}`);
        renderAnnouncements(data.items || []);
        if (paginationInfo) paginationInfo.textContent = `Showing ${data.from} to ${data.to} of ${data.total} announcements`;
        renderPaginationControls(paginationControls, data.page, data.totalPages, (p) => loadAnnouncements(p));
        await loadStats();
      } catch (e) {
        console.error('Failed to load announcements:', e);
        showToast(e.message, 'error');
      }
    }

    function renderAnnouncements(items) {
      if (!tableBody) return;
      tableBody.innerHTML = items.map(a => {
        const date = a.created_at ? formatDate(a.created_at) : '';
        const summaryText = typeof a.summary === 'string' ? a.summary : '';
        const summaryShort = summaryText.substring(0, 90);
        const statusColor =
          a.status === 'published' ? 'bg-primary-fixed text-on-primary-fixed-variant' :
          a.status === 'draft' ? 'bg-surface-container-highest text-on-surface-variant' :
          a.status === 'scheduled' ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant' :
          'bg-error-container text-on-error-container';
        return `
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="px-6 py-5">
              <div class="flex flex-col gap-1">
                <span class="text-sm font-black text-primary">${escapeHtml(a.title)}</span>
                <span class="text-xs text-on-surface-variant">${escapeHtml(summaryShort)}${summaryText.length > 90 ? 'â€¦' : ''}</span>
              </div>
            </td>
            <td class="px-6 py-5 text-sm font-bold text-primary">${escapeHtml(a.category || 'General')}</td>
            <td class="px-6 py-5"><span class="${statusColor} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">${escapeHtml(a.status)}</span></td>
            <td class="px-6 py-5 text-sm font-medium text-on-surface-variant">${date}</td>
            <td class="px-6 py-5 text-right">
              <div class="flex justify-end gap-2">
                <button data-action="edit" data-id="${a.id}" class="p-2 rounded-lg bg-surface-container-highest hover:bg-surface-container-high transition-colors text-primary">
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button data-action="delete" data-id="${a.id}" class="p-2 rounded-lg bg-error-container/30 hover:bg-error-container transition-colors text-error">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tableBody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            const a = await apiRequest(`/admin/announcements/${id}`);
            document.getElementById('announcement-id').value = a.id;
            document.getElementById('announcement-title').value = a.title || '';
            document.getElementById('announcement-summary').value = a.summary || '';
            document.getElementById('announcement-content').value = a.content || '';
            document.getElementById('announcement-category').value = a.category || 'Admin';
            document.getElementById('announcement-image-url').value = a.image_url || '';
            document.getElementById('announcement-status').value = a.status || 'draft';
            if (a.scheduled_for) {
              const dt = new Date(a.scheduled_for);
              const yyyy = dt.getFullYear();
              const mm = String(dt.getMonth() + 1).padStart(2, '0');
              const dd = String(dt.getDate()).padStart(2, '0');
              const hh = String(dt.getHours()).padStart(2, '0');
              const mi = String(dt.getMinutes()).padStart(2, '0');
              document.getElementById('announcement-scheduled-for').value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
            } else {
              document.getElementById('announcement-scheduled-for').value = '';
            }
            setPriority(a.priority || 'normal');
            open();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      tableBody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this announcement?')) return;
          try {
            await apiRequest(`/admin/announcements/${id}`, { method: 'DELETE' });
            showToast('Announcement deleted', 'success');
            await loadAnnouncements(currentPage);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });
    }

    document.getElementById('create-announcement-header-btn')?.addEventListener('click', open);
    document.getElementById('new-announcement-sidebar-btn')?.addEventListener('click', open);
    document.getElementById('fab-create-announcement')?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    document.getElementById('save-draft-btn')?.addEventListener('click', () => {
      submitMode = 'draft';
      form?.requestSubmit();
    });

    if (searchInput) {
      let t;
      searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          currentSearch = searchInput.value || '';
          loadAnnouncements(1);
        }, 400);
      });
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const id = (fd.get('id') || '').toString();

      const statusFromSelect = (document.getElementById('announcement-status')?.value || 'draft').toString();
      const status = submitMode === 'draft' ? 'draft' : (statusFromSelect === 'scheduled' ? 'scheduled' : 'published');

      const scheduledFor = (fd.get('scheduled_for') || '').toString();
      if (status === 'scheduled' && !scheduledFor) {
        showToast('Please set a schedule date/time', 'error');
        return;
      }

      const payload = {
        title: (fd.get('title') || '').toString(),
        summary: (fd.get('summary') || '').toString(),
        content: (fd.get('content') || '').toString(),
        category: (fd.get('category') || 'General').toString(),
        image_url: (fd.get('image_url') || '').toString() || null,
        priority: (fd.get('priority') || 'normal').toString(),
        status,
        scheduled_for: status === 'scheduled' ? scheduledFor.replace('T', ' ') + ':00' : null
      };

      if (!payload.title || !payload.content) {
        showToast('Headline and body are required', 'error');
        return;
      }

      try {
        if (id) {
          await apiRequest(`/admin/announcements/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Announcement updated', 'success');
        } else {
          await apiRequest('/admin/announcements', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Announcement created', 'success');
        }
        submitMode = 'publish';
        close();
        await loadAnnouncements(1);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    await loadAnnouncements(1);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }
  
  async function initGalleryAdmin() {
    if (!requireAuth()) return;

    let currentPage = 1;
    let currentSearch = '';

    const grid = document.getElementById('gallery-grid');
    const searchInput = document.getElementById('gallery-search');
    const paginationInfo = document.getElementById('gallery-pagination-info');
    const paginationControls = document.getElementById('gallery-pagination-controls');

    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const uploadBtn = document.getElementById('upload-images-btn');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');

    const editModal = document.getElementById('edit-image-modal');
    const editForm = document.getElementById('edit-image-form');

    function openEdit() {
      editModal?.classList.remove('hidden');
    }
    function closeEdit() {
      editModal?.classList.add('hidden');
      editForm?.reset();
      document.getElementById('edit-image-id') && (document.getElementById('edit-image-id').value = '');
    }

    async function loadStats() {
      try {
        const s = await apiRequest('/admin/gallery/stats');
        const bytes = Number(s.storageBytes || 0);
        const mb = (bytes / (1024 * 1024));
        const total = Number(s.totalImages || 0);
        document.getElementById('storage-usage-text') && (document.getElementById('storage-usage-text').textContent = `${mb.toFixed(1)} MB used â€¢ ${total} images`);
        const limitMb = 500;
        const pct = Math.min(100, Math.round((mb / limitMb) * 100));
        document.getElementById('storage-progress-bar') && (document.getElementById('storage-progress-bar').style.width = `${pct}%`);
      } catch (_) {}
    }

    async function loadGallery(page = 1) {
      currentPage = page;
      const q = new URLSearchParams({ page: String(page), limit: '12', search: currentSearch });
      try {
        const data = await apiRequest(`/admin/gallery?${q.toString()}`);
        renderGallery(data.items || []);
        if (paginationInfo) paginationInfo.textContent = `Showing ${data.from} to ${data.to} of ${data.total} images`;
        renderPaginationControls(paginationControls, data.page, data.totalPages, (p) => loadGallery(p));
        await loadStats();
      } catch (e) {
        console.error('Failed to load gallery:', e);
        showToast(e.message, 'error');
      }
    }

    function renderGallery(items) {
      if (!grid) return;
      grid.innerHTML = items.map(img => `
        <div class="bg-surface-container-lowest rounded-xl overflow-hidden border border-outline-variant/20">
          <div class="relative aspect-square bg-surface-container-low">
            <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.caption || 'Gallery image')}" class="w-full h-full object-cover"/>
            <div class="absolute top-3 left-3">
              <input type="checkbox" class="w-4 h-4 accent-primary" data-select-id="${img.id}"/>
            </div>
            <div class="absolute top-3 right-3 flex gap-2">
              <button class="p-2 rounded-lg bg-white/90 hover:bg-white text-primary" data-action="edit" data-id="${img.id}">
                <span class="material-symbols-outlined text-base">edit</span>
              </button>
              <button class="p-2 rounded-lg bg-white/90 hover:bg-white text-error" data-action="delete" data-id="${img.id}">
                <span class="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>
          <div class="p-4 space-y-1">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-black text-primary truncate">${escapeHtml(img.caption || 'Untitled')}</p>
              ${img.is_featured ? '<span class="text-[10px] font-black bg-secondary-container text-on-secondary-container px-2 py-1 rounded-full">FEATURED</span>' : ''}
            </div>
            <p class="text-xs text-on-surface-variant truncate">${escapeHtml(img.category || '—')}</p>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this image?')) return;
          try {
            await apiRequest(`/admin/gallery/${id}`, { method: 'DELETE' });
            showToast('Image deleted', 'success');
            await loadGallery(currentPage);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      grid.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            const img = await apiRequest(`/admin/gallery/${id}`);
            document.getElementById('edit-image-id').value = img.id;
            document.getElementById('edit-caption').value = img.caption || '';
            document.getElementById('edit-description').value = img.description || '';
            document.getElementById('edit-category').value = img.category || '';
            document.getElementById('edit-display-order').value = img.display_order || 0;
            document.getElementById('edit-featured').checked = Boolean(img.is_featured);
            openEdit();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });
    }

    async function uploadFiles(files) {
      if (!files || files.length === 0) return;
      for (const file of files) {
        const fd = new FormData();
        fd.append('image', file);
        fd.append('caption', file.name.replace(/\.[^/.]+$/, '').replaceAll('_', ' '));
        try {
          await apiRequest('/admin/gallery', { method: 'POST', body: fd });
        } catch (e) {
          showToast(`Upload failed: ${file.name}`, 'error');
        }
      }
      showToast('Upload complete', 'success');
      await loadGallery(1);
    }

    uploadBtn?.addEventListener('click', () => fileInput?.click());
    dropZone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      await uploadFiles(files);
      fileInput.value = '';
    });

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('bg-surface-container-high');
    });
    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('bg-surface-container-high');
    });
    dropZone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('bg-surface-container-high');
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
      await uploadFiles(files);
    });

    bulkDeleteBtn?.addEventListener('click', async () => {
      const selected = Array.from(document.querySelectorAll('input[data-select-id]:checked')).map(i => i.getAttribute('data-select-id'));
      if (selected.length === 0) {
        showToast('Select images first', 'info');
        return;
      }
      if (!confirm(`Delete ${selected.length} images?`)) return;
      for (const id of selected) {
        try {
          await apiRequest(`/admin/gallery/${id}`, { method: 'DELETE' });
        } catch (_) {}
      }
      showToast('Bulk delete complete', 'success');
      await loadGallery(currentPage);
    });

    document.getElementById('close-edit-modal-btn')?.addEventListener('click', closeEdit);
    document.getElementById('cancel-edit-btn')?.addEventListener('click', closeEdit);
    editModal?.addEventListener('click', (e) => {
      if (e.target === editModal) closeEdit();
    });

    editForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(editForm);
      const id = (fd.get('id') || '').toString();
      const payload = {
        caption: (fd.get('caption') || '').toString(),
        description: (fd.get('description') || '').toString(),
        category: (fd.get('category') || '').toString(),
        display_order: Number(fd.get('display_order') || 0),
        is_featured: fd.get('featured') === 'on'
      };
      try {
        await apiRequest(`/admin/gallery/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Image updated', 'success');
        closeEdit();
        await loadGallery(currentPage);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    if (searchInput) {
      let t;
      searchInput.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          currentSearch = searchInput.value || '';
          loadGallery(1);
        }, 400);
      });
    }

    await loadGallery(1);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  
  async function initReports() {
    if (!requireAuth()) return;
    console.log('Reports initialized');
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }
  
  async function initSettings() {
    if (!requireAuth()) return;
    
    // Load user profile
    try {
      const user = await apiRequest('/auth/me');
      document.getElementById('profile-name').value = user.name || '';
      document.getElementById('profile-email').value = user.email || '';
      document.getElementById('profile-role').value = user.role || '';
      document.getElementById('sidebar-admin-name').textContent = user.name;
      
      // Security info
      document.getElementById('twofa-status').textContent = user.twofaEnabled ? 'ACTIVE' : 'INACTIVE';
      document.getElementById('active-sessions').textContent = user.activeSessions || '1';
      document.getElementById('last-login-time').textContent = user.lastLogin ? formatDate(user.lastLogin, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      document.getElementById('last-login-ip').textContent = user.lastIp ? `IP: ${user.lastIp}` : '—';
    } catch (error) {
      console.error('Failed to load profile:', error);
    }

    // External links settings
    async function loadExternalLinks() {
      const joinInput = document.getElementById('link-join-service');
      const watchInput = document.getElementById('link-watch-online');
      if (!joinInput || !watchInput) return;
      try {
        const rows = await apiRequest('/admin/settings/links');
        const map = {};
        (rows || []).forEach(r => {
          if (r && r.key) map[r.key] = r.url || '';
        });
        joinInput.value = map.join_service || '';
        watchInput.value = map.watch_online || '';
      } catch (e) {
        console.error('Failed to load external links:', e);
      }
    }

    await loadExternalLinks();

    document.getElementById('external-links-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const joinUrl = (document.getElementById('link-join-service')?.value || '').trim();
      const watchUrl = (document.getElementById('link-watch-online')?.value || '').trim();
      const status = document.getElementById('external-links-status');
      if (status) status.textContent = 'Saving…';
      try {
        await apiRequest('/admin/settings/links', {
          method: 'PUT',
          body: JSON.stringify({
            links: [
              { key: 'join_service', url: joinUrl },
              { key: 'watch_online', url: watchUrl }
            ]
          })
        });
        if (status) status.textContent = 'Saved.';
        showToast('Links updated', 'success');
      } catch (err) {
        if (status) status.textContent = '';
        showToast(err.message, 'error');
      }
    });

    // Contact inbox
    const contactBody = document.getElementById('contact-messages-body');
    const contactInfo = document.getElementById('contact-pagination-info');
    const contactControls = document.getElementById('contact-pagination-controls');
    const contactSearch = document.getElementById('contact-search');
    const unreadOnly = document.getElementById('contact-unread-only');
    let contactPage = 1;
    let contactSearchValue = '';

    async function loadContactMessages(page = 1) {
      if (!contactBody) return;
      contactPage = page;
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: contactSearchValue,
        unreadOnly: unreadOnly?.checked ? 'true' : 'false'
      });
      try {
        const data = await apiRequest(`/admin/contact/messages?${params.toString()}`);
        const items = data.items || [];
        if (items.length === 0) {
          contactBody.innerHTML = '<tr><td class="px-6 py-6 text-sm text-on-surface-variant" colspan="4">No messages found.</td></tr>';
        } else {
          contactBody.innerHTML = items.map(m => `
            <tr class="hover:bg-surface-container-low transition-colors cursor-pointer" data-contact-id="${m.id}">
              <td class="px-6 py-5">
                <span class="${m.isRead ? 'bg-surface-container-highest text-on-surface-variant' : 'bg-secondary-container text-on-secondary-container'} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                  ${m.isRead ? 'READ' : 'NEW'}
                </span>
              </td>
              <td class="px-6 py-5 text-sm font-semibold text-primary">${escapeHtml(m.name)}<div class="text-xs text-on-surface-variant font-medium">${escapeHtml(m.email)}</div></td>
              <td class="px-6 py-5 text-sm text-on-surface-variant">${escapeHtml(m.subject || '(no subject)')}</td>
              <td class="px-6 py-5 text-sm text-on-surface-variant">${formatDate(m.createdAt)}</td>
            </tr>
          `).join('');
        }
        if (contactInfo) contactInfo.textContent = data.total ? `Showing ${data.from} to ${data.to} of ${data.total} messages` : '';
        renderPaginationControls(contactControls, data.page, data.totalPages, (p) => loadContactMessages(p));

        contactBody.querySelectorAll('tr[data-contact-id]').forEach(row => {
          row.addEventListener('click', async () => {
            const id = row.getAttribute('data-contact-id');
            const msg = items.find(x => String(x.id) === String(id));
            if (!msg) return;

            const { overlay } = openModal({
              title: `Contact Message #${msg.id}`,
              submitLabel: 'Send Reply',
              contentHtml: `
                <div class="space-y-2">
                  <div class="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em]">From</div>
                  <div class="text-sm font-black text-primary">${escapeHtml(msg.name)} <span class="text-on-surface-variant font-semibold">(${escapeHtml(msg.email)})</span></div>
                  ${msg.phone ? `<div class="text-sm text-on-surface-variant">Phone: ${escapeHtml(msg.phone)}</div>` : ''}
                  <div class="text-sm text-on-surface-variant">Received: ${formatDate(msg.createdAt)} ${msg.isRead ? '' : '<span class="ml-2 text-[10px] font-black bg-secondary-container text-on-secondary-container px-2 py-1 rounded-full">NEW</span>'}</div>
                </div>
                <div class="mt-4 p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
                  <div class="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Message</div>
                  <div class="text-sm text-on-surface-variant leading-6">${escapeHtml(msg.message).replace(/\\n/g, '<br>')}</div>
                </div>
                <div class="mt-4 grid grid-cols-1 gap-3">
                  <div>
                    <label class="text-xs font-bold text-on-surface-variant">Subject</label>
                    <input name="subject" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" value="${escapeHtml(msg.subject ? `Re: ${msg.subject}` : 'Re: Your message')}" required />
                  </div>
                  <div>
                    <label class="text-xs font-bold text-on-surface-variant">Reply</label>
                    <textarea name="message" rows="6" class="mt-2 w-full rounded-xl bg-surface-container-low border-0 focus:ring-2 focus:ring-primary/20" placeholder="Type your reply..." required></textarea>
                  </div>
                  <button type="button" data-mark-read class="w-fit px-4 py-2 rounded-xl font-bold bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface-container-low transition-colors text-primary">Mark as read</button>
                </div>
              `,
              onSubmit: async (fd, close) => {
                const payload = { subject: fd.get('subject'), message: fd.get('message') };
                try {
                  await apiRequest(`/admin/contact/messages/${msg.id}/reply`, { method: 'POST', body: JSON.stringify(payload) });
                  showToast('Reply sent', 'success');
                  close();
                  await loadContactMessages(contactPage);
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }
            });

            overlay?.querySelector('[data-mark-read]')?.addEventListener('click', async () => {
              try {
                await apiRequest(`/admin/contact/messages/${msg.id}/read`, { method: 'PUT' });
                showToast('Marked as read', 'success');
                await loadContactMessages(contactPage);
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });
        });
      } catch (err) {
        contactBody.innerHTML = '<tr><td class="px-6 py-6 text-sm text-error" colspan="4">Failed to load messages.</td></tr>';
      }
    }

    if (contactBody) {
      await loadContactMessages(1);
      if (contactSearch) {
        let t;
        contactSearch.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            contactSearchValue = (contactSearch.value || '').trim();
            loadContactMessages(1);
          }, 350);
        });
      }
      unreadOnly?.addEventListener('change', () => loadContactMessages(1));
    }
    
    // Profile form
    document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      try {
        await apiRequest('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(Object.fromEntries(formData))
        });
        showToast('Profile updated', 'success');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    
    // Password form
    document.getElementById('password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = document.getElementById('current-password').value;
      const newPass = document.getElementById('new-password').value;
      const confirm = document.getElementById('confirm-password').value;
      const msgDiv = document.getElementById('password-message');
      
      if (newPass !== confirm) {
        msgDiv.textContent = 'Passwords do not match';
        msgDiv.classList.remove('hidden');
        return;
      }
      
      try {
        await apiRequest('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword: current, newPassword: newPass })
        });
        showToast('Password changed', 'success');
        e.target.reset();
      } catch (error) {
        msgDiv.textContent = error.message;
        msgDiv.classList.remove('hidden');
      }
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  
  document.addEventListener('DOMContentLoaded', () => {
    normalizeAdminSidebar();
    renderPublicChrome();
    wireExternalLinks();
    // Public pages
    if (pageDetector.isHome) initHome();
    else if (pageDetector.isPrograms) initProgramsPublic();
    else if (pageDetector.isGallery) initGalleryPublic();
    else if (pageDetector.isAnnouncements) initAnnouncementsPublic();
    else if (pageDetector.isAnnouncementDetails) initAnnouncementDetails(pageDetector.announcementId);
    else if (pageDetector.isContact) initContact();
    
    // Auth pages
    else if (pageDetector.isLogin) initLogin();
    else if (pageDetector.isForgotPassword) initForgotPassword();
    else if (pageDetector.isVerifyOTP) initVerifyOTP();
    else if (pageDetector.isResetPassword) initResetPassword();
    
    // Admin pages
    else if (pageDetector.isDashboard) initDashboard();
    else if (pageDetector.isMembers) initMembers();
    else if (pageDetector.isMemberDetails) initMemberDetails(pageDetector.memberId);
    else if (pageDetector.isFinance) initFinance();
    else if (pageDetector.isProgramsAdmin) initProgramsAdmin();
    else if (pageDetector.isAnnouncementsAdmin) initAnnouncementsAdmin();
    else if (pageDetector.isGalleryAdmin) initGalleryAdmin();
    else if (pageDetector.isReports) initReports();
    else if (pageDetector.isSettings) initSettings();
    
    // Global logout buttons
    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
      btn.addEventListener('click', logout);
    });
  });

})();
