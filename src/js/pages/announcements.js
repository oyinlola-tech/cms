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
      if (data.pagination) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.pagination.page,
          data.pagination.totalPages,
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
        // open edit modal
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

  CMS.pages = CMS.pages || {};
  CMS.pages.announcementsAdmin = {
    init: function() {
      shared.init();
      if (!auth.requireAuth()) return;
      loadAnnouncements(1);
    },
    loadAnnouncements: loadAnnouncements
  };

})();