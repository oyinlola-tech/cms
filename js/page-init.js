/**
 * Page bootstrapper.
 *
 * Every HTML page used to carry its own inline <script> block calling
 * CMS.shared.init() plus a page initializer. Inline scripts force the CSP to
 * allow 'unsafe-inline', which defeats most of the protection XSS-wise, so the
 * dispatch now lives here and each page declares itself with
 * <body data-page="...">.
 */
(function () {
  'use strict';

  function resolveInitializer(name) {
    if (!name || !window.CMS) return null;

    var namespaces = [window.CMS.pages, window.CMS.authPages];
    for (var i = 0; i < namespaces.length; i++) {
      var group = namespaces[i];
      if (group && group[name] && typeof group[name].init === 'function') {
        return group[name].init.bind(group[name]);
      }
    }
    return null;
  }

  function boot() {
    if (!window.CMS) {
      console.error('CMS bundle failed to load; page scripts were skipped.');
      return;
    }

    // Shared chrome (sidebar state, footer year) runs on every page.
    if (window.CMS.shared && typeof window.CMS.shared.init === 'function') {
      try {
        window.CMS.shared.init();
      } catch (error) {
        console.error('Shared init failed:', error);
      }
    }

    // Site chrome shared by every public page - navigation and the footer's
    // weekly rail - is set up here rather than from each page module.
    ['nav', 'footer'].forEach(function (part) {
      var module = window.CMS[part];
      if (module && typeof module.init === 'function') {
        try {
          module.init();
        } catch (error) {
          console.error(part + ' init failed:', error);
        }
      }
    });

    var pageName = document.body ? document.body.getAttribute('data-page') : null;
    if (!pageName) return;

    var init = resolveInitializer(pageName);
    if (!init) {
      console.warn('No initializer registered for page "' + pageName + '".');
      return;
    }

    try {
      init();
    } catch (error) {
      console.error('Page init failed for "' + pageName + '":', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
