(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var showToast = shared ? shared.showToast : function() {};
  var openModal = shared ? shared.openModal : function() {};
  var renderPaginationControls = shared ? shared.renderPaginationControls : function() {};

  var currentPage = 1;

  function loadGallery(page) {
    page = page || 1;
    return api.apiRequest('/admin/gallery?page=' + page).then(function(data) {
      renderGalleryGrid(data.items || []);
      if (data.pagination) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.pagination.page,
          data.pagination.totalPages,
          function(newPage) {
            loadGallery(newPage);
          }
        );
      }
    }).catch(function(error) {
      console.error('Failed to load gallery:', error);
    });
  }

  function renderGalleryGrid(images) {
    var tbody = document.querySelector('#gallery-table tbody');
    if (!tbody) return;

    if (!images || images.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-on-surface-variant">No images found</td></tr>';
      return;
    }

    var html = '';
    images.forEach(function(img) {
      html += '<tr>' +
        '<td><img class="w-16 h-16 object-cover rounded" src="' + escapeHtml(img.url) + '"></td>' +
        '<td class="font-bold">' + escapeHtml(img.caption || '—') + '</td>' +
        '<td>' + escapeHtml(img.category || '—') + '</td>' +
        '<td>' + (img.is_featured ? '<span class="text-green-600">Yes</span>' : '—') + '</td>' +
        '<td>' +
          '<button class="text-primary hover:underline text-sm mr-2 edit-image-btn" data-id="' + img.id + '">Edit</button>' +
          '<button class="text-error hover:underline text-sm delete-image-btn" data-id="' + img.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;

    document.querySelectorAll('.delete-image-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this image?')) {
          deleteImage(id);
        }
      });
    });
  }

  function deleteImage(id) {
    return api.apiRequest('/admin/gallery/' + id, { method: 'DELETE' }).then(function() {
      showToast('Image deleted successfully', 'success');
      loadGallery(currentPage);
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete image', 'error');
    });
  }

  function initUpload() {
    var dropzone = document.getElementById('upload-dropzone');
    if (!dropzone) return;

    dropzone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropzone.classList.add('bg-primary/10', 'border-primary');
    });

    dropzone.addEventListener('dragleave', function() {
      dropzone.classList.remove('bg-primary/10', 'border-primary');
    });

    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropzone.classList.remove('bg-primary/10', 'border-primary');
      var files = e.dataTransfer.files;
      if (files.length > 0) {
        uploadImages(files);
      }
    });
  }

  function uploadImages(files) {
    var formData = new FormData();
    for (var i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    return api.apiRequest('/admin/gallery', {
      method: 'POST',
      body: formData
    }).then(function() {
      showToast('Images uploaded successfully', 'success');
      loadGallery(currentPage);
    }).catch(function(error) {
      showToast(error.message || 'Failed to upload images', 'error');
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.galleryAdmin = {
    init: function() {
      shared.init();
      if (!auth.requireAuth()) return;
      loadGallery(1);
      initUpload();
    },
    loadGallery: loadGallery
  };

})();