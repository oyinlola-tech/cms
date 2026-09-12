/**
 * Site navigation.
 *
 * Three behaviours, each tied to a pattern the markup declares:
 *
 *  - the announcement bar fills in the next service from the weekly schedule;
 *  - the sticky header gains a rule and shadow once the page scrolls;
 *  - the full-screen menu gives mobile a navigation it did not have at all
 *    (the links were `hidden md:flex` with nothing behind them).
 */
(function () {
  'use strict';

  var CMS = window.CMS = window.CMS || {};

  function escapeHtml(value) {
    return CMS.shared && CMS.shared.escapeHtml
      ? CMS.shared.escapeHtml(value)
      : String(value == null ? '' : value);
  }

  // ------------------------------------------------------- announcement bar

  function initAnnouncementBar() {
    var slot = document.getElementById('next-service');
    if (!slot || !CMS.schedule) return Promise.resolve();

    return CMS.schedule.loadWeek().then(function (rows) {
      var now = new Date();
      var next = CMS.schedule.resolveWeek(rows, now).next;
      if (!next || !next.next) return;

      var time = CMS.schedule.splitTime(next.start);

      var menuTime = document.getElementById('menu-next-service');
      var menuName = document.getElementById('menu-next-name');
      if (menuTime) menuTime.textContent = next.day + ' ' + time.clock + ' ' + time.meridiem;
      if (menuName) menuName.textContent = next.name;
      // The programme name is dropped on narrow screens so the bar stays a
      // single line.
      slot.innerHTML =
        '<span class="font-bold text-secondary-container">' + escapeHtml(CMS.schedule.relativeLabel(next.next, now)) + '</span>' +
        '<span class="text-on-primary/30" aria-hidden="true">&middot;</span>' +
        '<span>' + escapeHtml(next.day) + ' ' + escapeHtml(time.clock) + ' ' + escapeHtml(time.meridiem) + '</span>' +
        '<span class="hidden text-on-primary/30 sm:inline" aria-hidden="true">&middot;</span>' +
        '<span class="hidden text-on-primary/60 sm:inline">' + escapeHtml(next.name) + '</span>';
    });
  }

  // ---------------------------------------------------------- sticky header

  function initStickyHeader() {
    var header = document.getElementById('site-header');
    if (!header) return;

    var onScroll = function () {
      var scrolled = window.scrollY > 8;
      header.classList.toggle('border-outline-variant/40', scrolled);
      header.classList.toggle('border-transparent', !scrolled);
      header.classList.toggle('shadow-[0_1px_20px_rgba(0,45,28,0.06)]', scrolled);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ------------------------------------------------------ full-screen menu

  var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea';

  function initMobileMenu() {
    var menu = document.getElementById('mobile-menu');
    var openBtn = document.getElementById('menu-open');
    var closeBtn = document.getElementById('menu-close');
    if (!menu || !openBtn) return;

    var lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      menu.classList.remove('hidden');
      menu.classList.add('flex');
      openBtn.setAttribute('aria-expanded', 'true');
      // Stop the page behind the overlay from scrolling.
      document.documentElement.classList.add('overflow-hidden');
      document.body.classList.add('overflow-hidden');

      var first = menu.querySelector(FOCUSABLE);
      if (first) first.focus();
    }

    function close() {
      menu.classList.add('hidden');
      menu.classList.remove('flex');
      openBtn.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);

    menu.addEventListener('click', function (event) {
      // Following a link should dismiss the overlay.
      if (event.target.closest('a[href]')) close();
    });

    document.addEventListener('keydown', function (event) {
      if (menu.classList.contains('hidden')) return;

      if (event.key === 'Escape') {
        close();
        return;
      }

      // Keep focus inside the overlay while it is open.
      if (event.key === 'Tab') {
        var items = Array.prototype.filter.call(
          menu.querySelectorAll(FOCUSABLE),
          function (el) { return el.offsetParent !== null || el === document.activeElement; }
        );
        if (items.length === 0) return;

        var first = items[0];
        var last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // Returning to a wide viewport should not leave the overlay stuck open.
    if (window.matchMedia) {
      var wide = window.matchMedia('(min-width: 768px)');
      var onChange = function (event) {
        if (event.matches && !menu.classList.contains('hidden')) close();
      };
      if (wide.addEventListener) wide.addEventListener('change', onChange);
      else if (wide.addListener) wide.addListener(onChange);
    }
  }

  // ------------------------------------------------------------ active link

  /**
   * Marks the current page. Gold means "here" throughout the site, the same
   * way it means "next" on the schedule.
   */
  function markActiveLink() {
    var path = window.location.pathname;

    document.querySelectorAll('[data-nav-link]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;

      var isActive = href === '/'
        ? path === '/'
        : path === href || path.indexOf(href + '/') === 0;

      link.classList.toggle('is-current', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function init() {
    markActiveLink();
    initStickyHeader();
    initMobileMenu();
    return initAnnouncementBar();
  }

  CMS.nav = { init: init, markActiveLink: markActiveLink, initMobileMenu: initMobileMenu };
})();
