(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var showToast = shared ? shared.showToast : function() {};

  var currentPage = 1;
  var currentSearch = '';
  var selectedIds = [];

  // ------------------------------------------------------------------- list

  function loadGallery(page, search) {
    currentPage = page || 1;
    if (search !== undefined) currentSearch = search;

    var url = '/admin/gallery?page=' + currentPage;
    if (currentSearch) url += '&search=' + encodeURIComponent(currentSearch);

    return api.apiRequest(url).then(function(data) {
      renderGalleryGrid(data.items || []);
      renderPagination(data);
    }).catch(function(error) {
      console.error('Failed to load gallery:', error);
      showToast(error.message || 'Failed to load gallery', 'error');
    });
  }

  function loadStorageStats() {
    return api.apiRequest('/admin/gallery/stats').then(function(stats) {
      var text = document.getElementById('storage-usage-text');
      var bar = document.getElementById('storage-progress-bar');
      var bytes = Number(stats.storageBytes || 0);
      var mb = bytes / (1024 * 1024);

      if (text) {
        text.textContent = mb.toFixed(1) + ' MB used · ' + Number(stats.totalImages || 0) + ' images';
      }
      if (bar) {
        // No server-side quota exists; 500 MB is shown purely as a gauge.
        var pct = Math.max(0, Math.min(100, (mb / 500) * 100));
        bar.style.width = pct.toFixed(1) + '%';
      }
    }).catch(function() { /* storage panel is decorative */ });
  }

  function renderPagination(data) {
    var info = document.getElementById('gallery-pagination-info');
    if (info) {
      info.textContent = data.total > 0
        ? 'Showing ' + data.from + '-' + data.to + ' of ' + data.total
        : 'No images';
    }

    var controls = document.getElementById('gallery-pagination-controls');
    if (controls && shared.renderPaginationControls) {
      shared.renderPaginationControls(controls, data.page, data.totalPages, function(page) {
        loadGallery(page);
      });
    }
  }

  /** The page renders a card grid, not a table. */
  function renderGalleryGrid(images) {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;

    selectedIds = [];
    updateBulkDeleteState();

    if (images.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-center py-12 text-on-surface-variant">No images yet. Drop files above to upload.</p>';
      return;
    }

    grid.innerHTML = images.map(function(img) {
      return '<figure class="group relative bg-surface-container-low rounded-xl overflow-hidden shadow-sm" data-id="' + img.id + '">' +
        '<img src="' + escapeHtml(img.url) + '" alt="' + escapeHtml(img.caption || 'Gallery image') + '" ' +
          'loading="lazy" class="w-full h-44 object-cover"/>' +
        (img.is_featured
          ? '<span class="absolute top-2 left-2 bg-secondary-container text-on-secondary-container text-[10px] font-bold px-2 py-1 rounded-full">Featured</span>'
          : '') +
        '<label class="absolute top-2 right-2 bg-surface/80 rounded-md p-1 cursor-pointer">' +
          '<input type="checkbox" class="select-image accent-primary" data-id="' + img.id + '"/>' +
        '</label>' +
        '<figcaption class="p-3">' +
          '<div class="text-sm font-bold text-primary truncate">' + escapeHtml(img.caption || 'Untitled') + '</div>' +
          '<div class="text-xs text-on-surface-variant truncate">' + escapeHtml(img.category || 'Uncategorised') + '</div>' +
          '<div class="mt-2 flex gap-3">' +
            '<button type="button" class="text-primary hover:underline text-xs font-bold edit-image-btn" data-id="' + img.id + '">Edit</button>' +
            '<button type="button" class="text-error hover:underline text-xs font-bold delete-image-btn" data-id="' + img.id + '">Delete</button>' +
          '</div>' +
        '</figcaption>' +
      '</figure>';
    }).join('');

    grid.querySelectorAll('.edit-image-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openEditModal(Number(this.getAttribute('data-id')));
      });
    });

    grid.querySelectorAll('.delete-image-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        if (confirm('Delete this image? This cannot be undone.')) deleteImage(id);
      });
    });

    grid.querySelectorAll('.select-image').forEach(function(box) {
      box.addEventListener('change', function() {
        var id = Number(this.getAttribute('data-id'));
        if (this.checked) selectedIds.push(id);
        else selectedIds = selectedIds.filter(function(x) { return x !== id; });
        updateBulkDeleteState();
      });
    });
  }

  function updateBulkDeleteState() {
    var btn = document.getElementById('bulk-delete-btn');
    if (!btn) return;
    btn.disabled = selectedIds.length === 0;
    btn.textContent = selectedIds.length > 0 ? 'Delete ' + selectedIds.length + ' selected' : 'Delete selected';
  }

  function deleteImage(id) {
    return api.delete('/admin/gallery/' + id).then(function() {
      showToast('Image deleted', 'success');
      loadGallery(currentPage);
      loadStorageStats();
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete image', 'error');
    });
  }

  function bulkDelete() {
    if (selectedIds.length === 0) return Promise.resolve();
    if (!confirm('Delete ' + selectedIds.length + ' image(s)? This cannot be undone.')) return Promise.resolve();

    var ids = selectedIds.slice();
    return ids.reduce(function(promise, id) {
      return promise.then(function() { return api.delete('/admin/gallery/' + id).catch(function() {}); });
    }, Promise.resolve()).then(function() {
      showToast(ids.length + ' image(s) deleted', 'success');
      loadGallery(currentPage);
      loadStorageStats();
    });
  }

  // ----------------------------------------------------------------- upload

  /**
   * Uploads files one at a time.
   *
   * The previous version appended every file as 'images' in a single request
   * while the API accepts one file named 'image', so multer rejected it with
   * "Unexpected field" and gallery upload never worked at all.
   */
  function uploadImages(files) {
    var list = Array.prototype.slice.call(files);
    if (list.length === 0) return Promise.resolve();

    var uploaded = 0;
    var failures = [];

    return list.reduce(function(promise, file) {
      return promise.then(function() {
        var formData = new FormData();
        formData.append('image', file);

        return api.apiRequest('/admin/gallery', { method: 'POST', body: formData })
          .then(function() { uploaded += 1; })
          .catch(function(error) { failures.push(file.name + ': ' + (error.message || 'upload failed')); });
      });
    }, Promise.resolve()).then(function() {
      if (uploaded > 0) {
        showToast(uploaded + (uploaded === 1 ? ' image uploaded' : ' images uploaded'), 'success');
        loadGallery(1);
        loadStorageStats();
      }
      if (failures.length > 0) showToast(failures[0], 'error');
    });
  }

  function initUpload() {
    var dropzone = document.getElementById('drop-zone');
    var input = document.getElementById('file-input');

    if (input) {
      input.addEventListener('change', function() {
        if (this.files && this.files.length) {
          uploadImages(this.files);
          this.value = '';
        }
      });
    }

    var browseBtn = document.getElementById('upload-images-btn');
    if (browseBtn && input) {
      browseBtn.addEventListener('click', function() { input.click(); });
    }

    var sidebarBtn = document.getElementById('new-gallery-item-btn');
    if (sidebarBtn && input) {
      sidebarBtn.addEventListener('click', function() { input.click(); });
    }

    if (!dropzone) return;

    if (input) {
      dropzone.addEventListener('click', function() { input.click(); });
    }

    ['dragenter', 'dragover'].forEach(function(type) {
      dropzone.addEventListener(type, function(e) {
        e.preventDefault();
        dropzone.classList.add('bg-primary/10', 'border-primary');
      });
    });

    ['dragleave', 'drop'].forEach(function(type) {
      dropzone.addEventListener(type, function(e) {
        e.preventDefault();
        dropzone.classList.remove('bg-primary/10', 'border-primary');
      });
    });

    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) uploadImages(e.dataTransfer.files);
    });
  }

  // ------------------------------------------------------------- edit modal

  function modalEl() { return document.getElementById('edit-image-modal'); }

  function setField(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value == null ? '' : value;
  }

  function getField(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    var value = String(el.value || '').trim();
    return value === '' ? null : value;
  }

  /** This modal existed in the markup but nothing ever opened or submitted it. */
  function openEditModal(id) {
    var modal = modalEl();
    if (!modal) return Promise.resolve();

    return api.apiRequest('/admin/gallery/' + id).then(function(image) {
      setField('edit-image-id', image.id);
      setField('edit-caption', image.caption);
      setField('edit-description', image.description);
      setField('edit-category', image.category);
      setField('edit-display-order', image.display_order);
      setField('edit-featured', image.is_featured);

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.classList.add('overflow-hidden');
    }).catch(function(error) {
      showToast(error.message || 'Failed to load image', 'error');
    });
  }

  function closeEditModal() {
    var modal = modalEl();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  function initEditModal() {
    var form = document.getElementById('edit-image-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var id = getField('edit-image-id');
        if (!id) return;

        api.put('/admin/gallery/' + id, {
          caption: getField('edit-caption'),
          description: getField('edit-description'),
          category: getField('edit-category'),
          display_order: Number(getField('edit-display-order')) || 0,
          is_featured: getField('edit-featured')
        }).then(function() {
          showToast('Image updated', 'success');
          closeEditModal();
          loadGallery(currentPage);
        }).catch(function(error) {
          showToast(error.message || 'Failed to update image', 'error');
        });
      });
    }

    ['close-edit-modal-btn', 'cancel-edit-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', closeEditModal);
    });

    var modal = modalEl();
    if (modal) {
      modal.addEventListener('click', function(e) { if (e.target === modal) closeEditModal(); });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeEditModal();
    });
  }

  function initSearchAndBulk() {
    var search = document.getElementById('gallery-search');
    if (search) {
      var doSearch = shared.debounce(function(value) { loadGallery(1, value); }, 400);
      search.addEventListener('input', function() { doSearch(this.value); });
    }

    var bulkBtn = document.getElementById('bulk-delete-btn');
    if (bulkBtn) bulkBtn.addEventListener('click', bulkDelete);
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.galleryAdmin = {
    init: function() {
      if (!auth.requireAuth()) return;
      initUpload();
      initEditModal();
      initSearchAndBulk();
      loadGallery(1);
      loadStorageStats();
    },
    loadGallery: loadGallery,
    uploadImages: uploadImages
  };

})();
