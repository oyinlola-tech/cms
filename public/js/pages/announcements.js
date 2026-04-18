(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var debounce = shared ? shared.debounce : function(fn, delay) { return fn; };

  var currentPage = 1;
  var currentCategory = 'all';
  var currentSearch = '';

  function loadAnnouncements(page, category, search) {
    page = page || 1;
    category = category || 'all';
    search = search || '';

    var url = '/announcements?page=' + page + '&limit=6';
    if (category !== 'all') url += '&category=' + encodeURIComponent(category);
    if (search) url += '&search=' + encodeURIComponent(search);

    return api.apiRequest(url).then(function(data) {
      renderAnnouncementsGrid(data.items, page === 1);
      var loadMoreBtn = document.getElementById('load-more-announcements');
      if (!data.hasMore && loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
      } else if (loadMoreBtn) {
        loadMoreBtn.style.display = 'flex';
      }
    }).catch(function(error) {
      console.error('Failed to load announcements:', error);
    });
  }

  function renderAnnouncementsGrid(items, replace) {
    replace = replace !== false;
    var grid = document.getElementById('announcements-grid');
    if (!grid) return;

    var html = replace ? '' : grid.innerHTML;
    items.forEach(function(item, index) {
      if (index === 0 && replace) {
        html += '<article class="md:col-span-8 group relative overflow-hidden rounded-xl bg-surface-container-lowest editorial-shadow">' +
          '<div class="flex flex-col md:flex-row h-full">' +
            '<div class="md:w-1/2 overflow-hidden h-64 md:h-full">' +
            '<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="' + escapeHtml(item.image_url || '/images/placeholder.svg') + '" alt="' + escapeHtml(item.title) + '">' +
          '</div>' +
          '<div class="md:w-1/2 p-10 flex flex-col justify-between">' +
            '<div>' +
              '<div class="flex items-center gap-3 mb-6">' +
                '<span class="bg-secondary-container text-on-secondary-container px-3 py-1 rounded text-xs font-bold">FEATURED</span>' +
                '<span class="text-outline text-xs font-medium">' + formatDate(item.created_at).toUpperCase() + '</span>' +
              '</div>' +
              '<h3 class="text-3xl font-bold text-primary font-headline mb-4">' + escapeHtml(item.title) + '</h3>' +
              '<p class="text-on-surface-variant leading-relaxed">' + escapeHtml(item.summary) + '</p>' +
            '</div>' +
            '<a href="/announcements/' + item.id + '" class="text-primary font-bold flex items-center gap-2 mt-6 group-hover:translate-x-2 transition-transform w-fit">' +
              'Read Full Story <span class="material-symbols-outlined text-sm">arrow_forward</span>' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</article>';
        return;
      }

      html += '<article class="col-span-12 md:col-span-4 group relative overflow-hidden rounded-xl bg-surface-container-lowest p-8 flex flex-col transition-all hover:shadow-xl">' +
        '<div class="mb-4 overflow-hidden rounded-lg">' +
          '<img class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-700" src="' + escapeHtml(item.image_url || '/images/placeholder.svg') + '" alt="' + escapeHtml(item.title) + '">' +
        '</div>' +
        '<div class="flex items-center gap-3 mb-3">' +
          (item.is_new ? '<span class="bg-primary-container text-on-primary-container px-3 py-1 rounded text-xs font-bold">New</span>' : '') +
          '<span class="text-outline text-xs font-medium">' + formatDate(item.created_at).toUpperCase() + '</span>' +
        '</div>' +
        '<h3 class="text-xl font-bold text-primary mb-3">' + escapeHtml(item.title) + '</h3>' +
        '<p class="text-on-surface-variant text-sm mb-4 line-clamp-3">' + escapeHtml(item.summary) + '</p>' +
        '<a href="/announcements/' + item.id + '" class="text-primary font-bold text-sm mt-auto flex items-center gap-2 group-hover:translate-x-1 transition-transform w-fit">' +
          'Read More <span class="material-symbols-outlined text-sm">arrow_forward</span>' +
        '</a>' +
      '</article>';
    });
    grid.innerHTML = html;
  }

  function initFilterButtons() {
    var filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var category = this.getAttribute('data-category');
        currentCategory = category;
        filterBtns.forEach(function(b) {
          b.classList.remove('bg-primary', 'text-on-primary');
          b.classList.add('bg-surface-container-low', 'text-on-surface');
        });
        this.classList.remove('bg-surface-container-low', 'text-on-surface');
        this.classList.add('bg-primary', 'text-on-primary');
        currentPage = 1;
        loadAnnouncements(currentPage, category, currentSearch);
      });
    });
  }

  function initSearch() {
    var searchInput = document.getElementById('announcement-search');
    if (!searchInput) return;

    var doSearch = debounce(function(value) {
      currentSearch = value;
      currentPage = 1;
      loadAnnouncements(currentPage, currentCategory, value);
    }, 500);

    searchInput.addEventListener('input', function() {
      doSearch(this.value);
    });
  }

  function initLoadMore() {
    var loadMoreBtn = document.getElementById('load-more-announcements');
    if (!loadMoreBtn) return;

    loadMoreBtn.addEventListener('click', function() {
      currentPage++;
      loadAnnouncements(currentPage, currentCategory, currentSearch);
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.announcements = {
    init: function() {
      shared.init();
      loadAnnouncements(1);
      initFilterButtons();
      initSearch();
      initLoadMore();
    },
    loadAnnouncements: loadAnnouncements,
    renderAnnouncementsGrid: renderAnnouncementsGrid
  };

})();