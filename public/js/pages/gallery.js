(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };

  var currentPage = 1;

  function loadGallery(page) {
    page = page || 1;
    return api.apiRequest('/gallery?page=' + page + '&limit=8').then(function(data) {
      renderGalleryGrid(data.items, page === 1);
      var loadMoreBtn = document.getElementById('load-more-btn');
      if (!data.hasMore && loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
      }
    }).catch(function(error) {
      console.error('Failed to load gallery:', error);
    });
  }

  function renderGalleryGrid(images, replace) {
    replace = replace !== false;
    var container = document.getElementById('gallery-grid');
    if (!container) return;

    var html = replace ? '' : container.innerHTML;
    images.forEach(function(img, index) {
      var colSpan = 'md:col-span-4';
      var rowSpan = '';
      if (index === 0) {
        colSpan = 'md:col-span-8';
      } else if (index === 3) {
        colSpan = 'md:col-span-6';
      }

      html += '<div class="' + colSpan + ' group relative overflow-hidden rounded-xl bg-surface-container-low ' + (index === 0 ? 'aspect-[16/9]' : 'aspect-square md:aspect-auto') + '">' +
        '<img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src="' + escapeHtml(img.url) + '" alt="' + escapeHtml(img.caption) + '">' +
        '<div class="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex flex-col justify-end p-6">' +
          '<span class="text-secondary-fixed text-xs font-bold uppercase tracking-widest mb-1">' + escapeHtml(img.category || 'Gallery') + '</span>' +
          '<h3 class="text-white text-xl font-bold font-headline">' + escapeHtml(img.caption) + '</h3>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = html;
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.gallery = {
    init: function() {
      shared.init();
      var self = this;
      loadGallery(1).then(function() {
        var loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
          loadMoreBtn.addEventListener('click', function() {
            currentPage++;
            loadGallery(currentPage);
          });
        }
      });
    },
    loadGallery: loadGallery,
    renderGalleryGrid: renderGalleryGrid
  };

})();