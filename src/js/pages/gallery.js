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
      if (data.totalPages > 1) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.page,
          data.totalPages,
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

    document.querySelectorAll('.edit-image-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        editImage(Number(this.getAttribute('data-id')));
      });
    });

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

  /**
   * Uploads the selected files one at a time.
   *
   * This used to append every file under the field name 'images' in a single
   * request, while the API accepts a single file under 'image' - multer
   * rejected it with "Unexpected field", so gallery upload never worked.
   */
  function uploadImages(files) {
    var list = Array.prototype.slice.call(files);
    if (list.length === 0) return Promise.resolve();

    var uploaded = 0;
    var failures = [];

    var chain = list.reduce(function(promise, file) {
      return promise.then(function() {
        var formData = new FormData();
        formData.append('image', file);

        return api.apiRequest('/admin/gallery', {
          method: 'POST',
          body: formData
        }).then(function() {
          uploaded += 1;
        }).catch(function(error) {
          failures.push(file.name + ': ' + (error.message || 'upload failed'));
        });
      });
    }, Promise.resolve());

    return chain.then(function() {
      if (uploaded > 0) {
        showToast(uploaded + (uploaded === 1 ? ' image uploaded' : ' images uploaded'), 'success');
        loadGallery(currentPage);
      }
      if (failures.length > 0) {
        showToast(failures[0], 'error');
      }
    });
  }

  function editImage(id) {
    return api.apiRequest('/admin/gallery/' + id).then(function(image) {
      shared.openModal({
        title: 'Edit image',
        submitLabel: 'Save changes',
        contentHtml:
          '<img src="' + escapeHtml(image.url) + '" alt="" class="w-full h-40 object-cover rounded-xl mb-4"/>' +
          field('caption', 'Caption', image.caption, 'text', 255) +
          field('description', 'Description', image.description, 'textarea', 2000) +
          field('category', 'Category', image.category, 'text', 50) +
          field('display_order', 'Display order', image.display_order, 'number') +
          '<label class="flex items-center gap-2 text-sm font-semibold">' +
            '<input type="checkbox" name="is_featured" ' + (image.is_featured ? 'checked' : '') + '/> Featured' +
          '</label>',
        onSubmit: function(formData, close) {
          return api.put('/admin/gallery/' + id, {
            caption: formData.get('caption'),
            description: formData.get('description'),
            category: formData.get('category'),
            display_order: Number(formData.get('display_order')) || 0,
            is_featured: formData.get('is_featured') === 'on'
          }).then(function() {
            showToast('Image updated', 'success');
            close();
            loadGallery(currentPage);
          }).catch(function(error) {
            showToast(error.message || 'Failed to update image', 'error');
          });
        }
      });
    }).catch(function(error) {
      showToast(error.message || 'Failed to load image', 'error');
    });
  }

  function field(name, label, value, type, maxLength) {
    var attrs = 'name="' + name + '" id="gal-' + name + '"' +
      (maxLength ? ' maxlength="' + maxLength + '"' : '') +
      ' class="w-full bg-surface-container-highest rounded-lg px-4 py-3 mb-4"';
    var control = type === 'textarea'
      ? '<textarea ' + attrs + ' rows="3">' + escapeHtml(value == null ? '' : value) + '</textarea>'
      : '<input type="' + (type || 'text') + '" ' + attrs + ' value="' + escapeHtml(value == null ? '' : value) + '"/>';
    return '<label class="block text-xs font-bold text-primary mb-1" for="gal-' + name + '">' + label + '</label>' + control;
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.galleryAdmin = {
    init: function() {
      if (!auth.requireAuth()) return;
      loadGallery(1);
      initUpload();
    },
    loadGallery: loadGallery,
    uploadImages: uploadImages,
    editImage: editImage
  };

})();