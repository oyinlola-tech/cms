(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var showToast = shared ? shared.showToast : function() {};
  var openModal = shared ? shared.openModal : function() {};
  var debounce = shared ? shared.debounce : function(fn) { return fn; };
  var renderPaginationControls = shared ? shared.renderPaginationControls : function() {};

  var currentPage = 1;

  function loadAnnouncements(page) {
    page = page || 1;
    return api.apiRequest('/admin/announcements?page=' + page).then(function(data) {
      renderAnnouncementsTable(data.items || []);
      if (data.totalPages > 1) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.page,
          data.totalPages,
          function(newPage) {
            loadAnnouncements(newPage);
          }
        );
      }
    }).catch(function(error) {
      console.error('Failed to load announcements:', error);
    });
  }

  function renderAnnouncementsTable(announcements) {
    var tbody = document.querySelector('#announcements-table tbody');
    if (!tbody) return;

    if (!announcements || announcements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-on-surface-variant">No announcements found</td></tr>';
      return;
    }

    var html = '';
    announcements.forEach(function(ann) {
      var statusBadge = ann.status === 'published' ? 'bg-green-100 text-green-800' :
                      ann.status === 'draft' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800';
      html += '<tr>' +
        '<td><img class="w-12 h-12 object-cover rounded" src="' + escapeHtml(ann.image_url || '/images/placeholder.svg') + '"></td>' +
        '<td class="font-bold">' + escapeHtml(ann.title) + '</td>' +
        '<td>' + escapeHtml(ann.category || '—') + '</td>' +
        '<td><span class="px-2 py-1 rounded text-xs font-bold ' + statusBadge + '">' + escapeHtml(ann.status) + '</span></td>' +
        '<td>' + formatDate(ann.created_at) + '</td>' +
        '<td>' + (ann.views || 0) + '</td>' +
        '<td>' +
          '<button class="text-primary hover:underline text-sm mr-2 edit-announcement-btn" data-id="' + ann.id + '">Edit</button>' +
          '<button class="text-error hover:underline text-sm delete-announcement-btn" data-id="' + ann.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;

    document.querySelectorAll('.edit-announcement-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openAnnouncementModal(Number(this.getAttribute('data-id')));
      });
    });

    document.querySelectorAll('.delete-announcement-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this announcement?')) {
          deleteAnnouncement(id);
        }
      });
    });
  }

  function deleteAnnouncement(id) {
    return api.apiRequest('/admin/announcements/' + id, { method: 'DELETE' }).then(function() {
      showToast('Announcement deleted successfully', 'success');
      loadAnnouncements(currentPage);
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete announcement', 'error');
    });
  }

  function announcementFormHtml(item) {
    item = item || {};
    var dt = function(value) { return value ? String(value).replace(' ', 'T').slice(0, 16) : ''; };
    var select = function(name, label, value, options) {
      return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="a-' + name + '">' + label + '</label>' +
        '<select id="a-' + name + '" name="' + name + '" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
          options.map(function(opt) {
            return '<option value="' + opt + '"' + (String(value) === opt ? ' selected' : '') + '>' + opt + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    };

    return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="a-title">Title</label>' +
        '<input id="a-title" name="title" required minlength="3" maxlength="200" ' +
          'class="w-full bg-surface-container-highest rounded-lg px-4 py-3" ' +
          'value="' + escapeHtml(item.title || '') + '"/>' +
      '</div>' +
      '<div class="mt-4">' +
        '<label class="block text-xs font-bold text-primary mb-1" for="a-summary">Summary</label>' +
        '<input id="a-summary" name="summary" maxlength="300" ' +
          'class="w-full bg-surface-container-highest rounded-lg px-4 py-3" ' +
          'placeholder="Left blank, the first 160 characters of the body are used" ' +
          'value="' + escapeHtml(item.summary || '') + '"/>' +
      '</div>' +
      '<div class="mt-4">' +
        '<label class="block text-xs font-bold text-primary mb-1" for="a-content">Body</label>' +
        '<textarea id="a-content" name="content" rows="8" maxlength="20000" ' +
          'class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
          escapeHtml(item.content || '') +
        '</textarea>' +
        '<p class="text-xs text-on-surface-variant mt-1">Plain text. Blank lines start a new paragraph.</p>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">' +
        select('status', 'Status', item.status || 'draft', ['draft', 'published', 'scheduled', 'archived']) +
        select('priority', 'Priority', item.priority || 'normal', ['normal', 'high', 'urgent']) +
        '<div>' +
          '<label class="block text-xs font-bold text-primary mb-1" for="a-category">Category</label>' +
          '<input id="a-category" name="category" maxlength="50" ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3" ' +
            'value="' + escapeHtml(item.category || 'General') + '"/>' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-bold text-primary mb-1" for="a-scheduled">Publish at (scheduled only)</label>' +
          '<input id="a-scheduled" name="scheduled_for" type="datetime-local" ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3" ' +
            'value="' + dt(item.scheduled_for) + '"/>' +
        '</div>' +
      '</div>' +
      '<div class="flex gap-6 mt-4">' +
        '<label class="flex items-center gap-2 text-sm font-semibold">' +
          '<input type="checkbox" name="is_new" ' + (item.is_new ? 'checked' : '') + '/> Mark as new</label>' +
        '<label class="flex items-center gap-2 text-sm font-semibold">' +
          '<input type="checkbox" name="is_featured" ' + (item.is_featured ? 'checked' : '') + '/> Featured</label>' +
      '</div>';
  }

  function readAnnouncementForm(formData, overrideStatus) {
    var value = function(name) {
      var raw = formData.get(name);
      return raw === null || String(raw).trim() === '' ? null : String(raw).trim();
    };
    var status = overrideStatus || value('status') || 'draft';

    return {
      title: value('title'),
      summary: value('summary'),
      content: value('content'),
      category: value('category') || 'General',
      priority: value('priority') || 'normal',
      status: status,
      scheduled_for: status === 'scheduled' ? value('scheduled_for') : null,
      is_new: formData.get('is_new') === 'on',
      is_featured: formData.get('is_featured') === 'on'
    };
  }

  /**
   * Create/edit modal. The edit handler was an empty stub and none of the
   * "new announcement" buttons had listeners, so the POST/PUT endpoints were
   * unreachable from the UI.
   */
  function openAnnouncementModal(id) {
    var load = id ? api.apiRequest('/admin/announcements/' + id) : Promise.resolve(null);

    return load.then(function(item) {
      shared.openModal({
        title: id ? 'Edit announcement' : 'New announcement',
        submitLabel: id ? 'Save changes' : 'Create',
        contentHtml: announcementFormHtml(item),
        onSubmit: function(formData, close) {
          var payload = readAnnouncementForm(formData);
          if (!payload.title || payload.title.length < 3) {
            showToast('Title must be at least 3 characters', 'error');
            return;
          }
          if (payload.status === 'scheduled' && !payload.scheduled_for) {
            showToast('A scheduled announcement needs a publish date and time', 'error');
            return;
          }

          var request = id
            ? api.put('/admin/announcements/' + id, payload)
            : api.post('/admin/announcements', payload);

          return request.then(function() {
            showToast(id ? 'Announcement updated' : 'Announcement created', 'success');
            close();
            loadAnnouncements(id ? currentPage : 1);
          }).catch(function(error) {
            showToast(error.message || 'Failed to save announcement', 'error');
          });
        }
      });
    }).catch(function(error) {
      showToast(error.message || 'Failed to load announcement', 'error');
    });
  }

  function initCreateButtons() {
    ['create-announcement-header-btn', 'new-announcement-sidebar-btn', 'fab-create-announcement', 'new-record-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function() { openAnnouncementModal(null); });
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.announcementsAdmin = {
    init: function() {
      if (!auth.requireAuth()) return;
      loadAnnouncements(1);
      initCreateButtons();
    },
    loadAnnouncements: loadAnnouncements
  };

})();