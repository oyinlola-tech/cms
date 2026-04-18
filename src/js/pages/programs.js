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
  var currentCategory = 'all';

  function loadPrograms(page, category) {
    page = page || 1;
    category = category || 'all';
    var url = '/admin/programs?page=' + page;
    if (category !== 'all') url += '&category=' + encodeURIComponent(category);

    return api.apiRequest(url).then(function(data) {
      renderProgramsTable(data.items || []);
      if (data.pagination) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.pagination.page,
          data.pagination.totalPages,
          function(newPage) {
            loadPrograms(newPage, currentCategory);
          }
        );
      }
    }).catch(function(error) {
      console.error('Failed to load programs:', error);
    });
  }

  function renderProgramsTable(programs) {
    var tbody = document.querySelector('#programs-table tbody');
    if (!tbody) return;

    if (!programs || programs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No programs found</td></tr>';
      return;
    }

    var html = '';
    programs.forEach(function(prog) {
      html += '<tr>' +
        '<td>' + formatDate(prog.start_datetime || prog.date) + '</td>' +
        '<td>' + escapeHtml(prog.title) + '</td>' +
        '<td>' + escapeHtml(prog.type || '—') + '</td>' +
        '<td><span class="px-2 py-1 rounded text-xs font-bold bg-surface-container-low">' + escapeHtml(prog.status || 'Scheduled') + '</span></td>' +
        '<td>' +
          '<button class="text-primary hover:underline text-sm mr-2 edit-program-btn" data-id="' + prog.id + '">Edit</button>' +
          '<button class="text-error hover:underline text-sm delete-program-btn" data-id="' + prog.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;

    document.querySelectorAll('.edit-program-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        // open edit modal
      });
    });

    document.querySelectorAll('.delete-program-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this program?')) {
          deleteProgram(id);
        }
      });
    });
  }

  function deleteProgram(id) {
    return api.apiRequest('/admin/programs/' + id, { method: 'DELETE' }).then(function() {
      showToast('Program deleted successfully', 'success');
      loadPrograms(currentPage, currentCategory);
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete program', 'error');
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.programsAdmin = {
    init: function() {
      shared.init();
      if (!auth.requireAuth()) return;
      loadPrograms(1);
    },
    loadPrograms: loadPrograms
  };

})();