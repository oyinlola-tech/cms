(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var formatTime = shared ? shared.formatTime : function(d) { return d; };
  var showToast = shared ? shared.showToast : function() {};

  function fetchHomeAnnouncements() {
    return api.apiRequest('/announcements?limit=3&status=published').then(function(data) {
      renderHomeAnnouncements(data.items || []);
    }).catch(function(error) {
      console.error('Failed to load announcements:', error);
    });
  }

  function renderHomeAnnouncements(announcements) {
    var container = document.getElementById('announcements-container');
    if (!container) return;
    if (!announcements || announcements.length === 0) {
      container.innerHTML = '<p class="col-span-12 text-center text-on-surface-variant py-12">No announcements yet.</p>';
      return;
    }

    var featured = announcements[0];
    var smalls = announcements.slice(1, 3);

    var html = '<div class="col-span-12 md:col-span-8 bg-surface-container-low rounded-xl overflow-hidden flex flex-col md:flex-row group">' +
      '<div class="md:w-1/2 overflow-hidden">' +
        '<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" ' +
             'src="' + escapeHtml(featured.image_url || '/images/placeholder.svg') + '" alt="' + escapeHtml(featured.title) + '">' +
      '</div>' +
      '<div class="md:w-1/2 p-8 flex flex-col justify-center space-y-4">' +
        '<span class="text-secondary font-bold text-xs uppercase tracking-widest">' + escapeHtml(featured.category || 'Announcement') + '</span>' +
        '<h3 class="font-headline text-3xl font-bold text-primary">' + escapeHtml(featured.title) + '</h3>' +
        '<p class="text-on-surface-variant">' + escapeHtml(featured.summary) + '</p>' +
        '<a href="/announcements/' + featured.id + '" class="text-primary font-bold w-fit border-b-2 border-primary/20 pb-1 hover:border-primary transition-all">Read More</a>' +
      '</div>' +
    '</div>' +
    '<div class="col-span-12 md:col-span-4 space-y-6">';

    smalls.forEach(function(item) {
      html += '<div class="bg-surface-container-lowest p-6 rounded-xl space-y-3 shadow-sm">' +
        '<div class="flex justify-between items-start">' +
          (item.is_new ? '<span class="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-bold">New</span>' : '') +
          '<span class="text-on-surface-variant text-sm">' + formatDate(item.created_at) + '</span>' +
        '</div>' +
        '<h4 class="font-headline text-xl font-bold text-primary">' + escapeHtml(item.title) + '</h4>' +
        '<p class="text-sm text-on-surface-variant">' + escapeHtml(item.summary) + '</p>' +
      '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function fetchHomePrograms() {
    return api.apiRequest('/programs?limit=3').then(function(data) {
      renderHomePrograms(Array.isArray(data) ? data : []);
    }).catch(function(error) {
      console.error('Failed to load programs:', error);
    });
  }

  function renderHomePrograms(programs) {
    var container = document.getElementById('programs-container');
    if (!container) return;

    // Previously this required at least 3 programs, so a parish with one or
    // two upcoming programs saw "coming soon" instead of its own schedule -
    // and the renderer then indexed programs[1] and programs[2] unguarded,
    // which would have thrown had the guard been relaxed on its own.
    if (!programs || programs.length === 0) {
      container.innerHTML = '<p class="col-span-3 text-center text-on-surface-variant py-12">Program schedule coming soon.</p>';
      return;
    }

    var iconMap = {
      devotion: 'event',
      service: 'church',
      fellowship: 'groups',
      bible_study: 'menu_book',
      outreach: 'volunteer_activism',
      youth: 'diversity_3'
    };

    // The middle card is the highlighted one. With a single program that is
    // the only card; otherwise prefer whichever program is the main service.
    var featuredIndex = 0;
    for (var i = 0; i < programs.length; i++) {
      if (programs[i].is_main_service) { featuredIndex = i; break; }
      if (i === 1) featuredIndex = 1;
    }
    if (programs.length >= 3 && !programs.some(function(p) { return p.is_main_service; })) {
      featuredIndex = 1;
    }

    var offsets = ['md:-translate-y-4', '', 'md:translate-y-8'];

    container.innerHTML = programs.map(function(program, index) {
      var icon = iconMap[program.type] || 'event';
      var schedule = program.schedule
        || (program.start_datetime ? formatDate(program.start_datetime) + ' \u00b7 ' + formatTime(program.start_datetime) : '');
      var description = program.description || '';

      if (index === featuredIndex) {
        return '<div class="bg-primary text-on-primary rounded-xl p-8 space-y-6 shadow-2xl md:scale-105 z-10 relative">' +
            (program.is_main_service
              ? '<div class="absolute -top-4 -right-4 bg-secondary-container text-on-secondary-fixed px-4 py-2 rounded-lg font-black text-xs uppercase">Main Service</div>'
              : '') +
            '<div class="w-14 h-14 bg-surface-container-highest flex items-center justify-center rounded-xl">' +
              '<span class="material-symbols-outlined text-primary text-3xl">' + icon + '</span>' +
            '</div>' +
            '<h3 class="font-headline text-2xl font-bold">' + escapeHtml(program.title) + '</h3>' +
            '<p class="opacity-80">' + escapeHtml(description) + '</p>' +
            (schedule
              ? '<div class="pt-4 border-t border-on-primary/20 flex items-center gap-3">' +
                  '<span class="material-symbols-outlined text-secondary-fixed">schedule</span>' +
                  '<span class="text-sm font-semibold">' + escapeHtml(schedule) + '</span>' +
                '</div>'
              : '') +
            '<a href="/contact" class="block text-center w-full py-3 bg-secondary-container text-on-secondary-fixed rounded-xl font-bold mt-4 hover:bg-secondary-fixed transition-colors">Plan Your Visit</a>' +
          '</div>';
      }

      return '<div class="bg-surface-container-lowest rounded-xl p-8 space-y-6 transform ' + (offsets[index] || '') + '">' +
          '<div class="w-14 h-14 bg-secondary-container flex items-center justify-center rounded-xl">' +
            '<span class="material-symbols-outlined text-on-secondary-container text-3xl">' + icon + '</span>' +
          '</div>' +
          '<h3 class="font-headline text-2xl font-bold text-primary">' + escapeHtml(program.title) + '</h3>' +
          '<p class="text-on-surface-variant">' + escapeHtml(description) + '</p>' +
          (schedule
            ? '<div class="pt-4 border-t border-outline-variant/30 flex items-center gap-3">' +
                '<span class="material-symbols-outlined text-secondary">schedule</span>' +
                '<span class="text-sm font-semibold">' + escapeHtml(schedule) + '</span>' +
              '</div>'
            : '') +
        '</div>';
    }).join('');
  }

  function fetchHomeGallery() {
    return api.apiRequest('/gallery?limit=4').then(function(data) {
      renderHomeGallery(data.items || []);
    }).catch(function(error) {
      console.error('Failed to load gallery:', error);
    });
  }

  function renderHomeGallery(images) {
    var container = document.getElementById('gallery-preview');
    if (!container) return;
    if (!images || images.length < 4) {
      container.innerHTML = '<p class="col-span-12 text-center text-on-surface-variant">Gallery coming soon.</p>';
      return;
    }

    var img1 = images[0];
    var img2 = images[1];
    var img3 = images[2];
    var img4 = images[3];

    container.innerHTML = '<div class="col-span-12 md:col-span-4 h-full">' +
      '<img class="w-full h-full object-cover rounded-xl shadow-lg" src="' + escapeHtml(img1.url) + '" alt="' + escapeHtml(img1.caption) + '">' +
    '</div>' +
    '<div class="col-span-12 md:col-span-8 grid grid-cols-2 gap-4">' +
      '<div class="h-full">' +
        '<img class="w-full h-full object-cover rounded-xl shadow-lg" src="' + escapeHtml(img2.url) + '" alt="' + escapeHtml(img2.caption) + '">' +
      '</div>' +
      '<div class="h-full grid grid-rows-2 gap-4">' +
        '<img class="w-full h-full object-cover rounded-xl shadow-lg" src="' + escapeHtml(img3.url) + '" alt="' + escapeHtml(img3.caption) + '">' +
        '<img class="w-full h-full object-cover rounded-xl shadow-lg" src="' + escapeHtml(img4.url) + '" alt="' + escapeHtml(img4.caption) + '">' +
      '</div>' +
    '</div>';
  }

  function wireExternalLinks() {
    var buttons = document.querySelectorAll('a[href^="http"]');
    buttons.forEach(function(btn) {
      btn.setAttribute('target', '_blank');
      btn.setAttribute('rel', 'noopener noreferrer');
    });
  }

  /**
   * The hero photograph is hosted externally, so it can disappear without
   * warning. If it fails, the arch falls back to a tonal panel rather than a
   * broken-image icon. (An inline onerror attribute would be blocked by the
   * CSP, so the handler is attached here.)
   */
  function initHeroImage() {
    var frame = document.getElementById('hero-frame');
    var image = document.getElementById('hero-image');
    if (!frame || !image) return;

    var fail = function () { frame.classList.add('is-empty'); };

    image.addEventListener('error', fail);
    // Covers the case where the image already failed before this ran.
    if (image.complete && image.naturalWidth === 0) fail();
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.home = {
    init: function() {
      initHeroImage();
      Promise.all([
        fetchHomeAnnouncements(),
        fetchHomePrograms(),
        fetchHomeGallery()
      ]).then(wireExternalLinks);
    },
    fetchHomeAnnouncements: fetchHomeAnnouncements,
    renderHomeAnnouncements: renderHomeAnnouncements,
    fetchHomePrograms: fetchHomePrograms,
    renderHomePrograms: renderHomePrograms,
    fetchHomeGallery: fetchHomeGallery,
    renderHomeGallery: renderHomeGallery
  };

})();