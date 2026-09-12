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
      if (data.totalPages > 1) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.page,
          data.totalPages,
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
        openProgramModal(Number(this.getAttribute('data-id')));
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

  function programFormHtml(program) {
    program = program || {};
    var dt = function(value) { return value ? String(value).replace(' ', 'T').slice(0, 16) : ''; };
    var input = function(name, label, value, attrs) {
      return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="p-' + name + '">' + label + '</label>' +
        '<input id="p-' + name + '" name="' + name + '" ' + (attrs || '') +
          ' class="w-full bg-surface-container-highest rounded-lg px-4 py-3"' +
          ' value="' + escapeHtml(value == null ? '' : value) + '"/>' +
      '</div>';
    };
    var select = function(name, label, value, options) {
      return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="p-' + name + '">' + label + '</label>' +
        '<select id="p-' + name + '" name="' + name + '" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
          options.map(function(opt) {
            return '<option value="' + opt + '"' + (String(value) === opt ? ' selected' : '') + '>' + opt + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    };

    return input('title', 'Title', program.title, 'required minlength="3" maxlength="200"') +
      '<div class="mt-4"><label class="block text-xs font-bold text-primary mb-1" for="p-description">Description</label>' +
        '<textarea id="p-description" name="description" rows="3" maxlength="10000" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
          escapeHtml(program.description || '') +
        '</textarea></div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">' +
        select('type', 'Type', program.type || 'service', ['devotion', 'service', 'fellowship', 'bible_study', 'outreach', 'youth', 'other']) +
        select('status', 'Status', program.status || 'upcoming', ['upcoming', 'ongoing', 'completed', 'cancelled']) +
        input('start_datetime', 'Starts', dt(program.start_datetime), 'type="datetime-local" required') +
        input('end_datetime', 'Ends', dt(program.end_datetime), 'type="datetime-local"') +
        input('location', 'Location', program.location, 'maxlength="200"') +
        input('category', 'Category', program.category, 'maxlength="50"') +
        select('recurring', 'Repeats', program.recurring || 'none', ['none', 'daily', 'weekly', 'monthly']) +
        input('schedule', 'Schedule label', program.schedule, 'maxlength="100"') +
      '</div>' +
      '<div class="flex gap-6 mt-4">' +
        '<label class="flex items-center gap-2 text-sm font-semibold">' +
          '<input type="checkbox" name="is_main_service" ' + (program.is_main_service ? 'checked' : '') + '/> Main service</label>' +
        '<label class="flex items-center gap-2 text-sm font-semibold">' +
          '<input type="checkbox" name="is_featured" ' + (program.is_featured ? 'checked' : '') + '/> Featured</label>' +
      '</div>';
  }

  function readProgramForm(formData) {
    var value = function(name) {
      var raw = formData.get(name);
      return raw === null || String(raw).trim() === '' ? null : String(raw).trim();
    };
    return {
      title: value('title'),
      description: value('description'),
      type: value('type') || 'service',
      category: value('category'),
      location: value('location'),
      start_datetime: value('start_datetime'),
      end_datetime: value('end_datetime'),
      recurring: value('recurring') || 'none',
      schedule: value('schedule'),
      status: value('status') || 'upcoming',
      is_main_service: formData.get('is_main_service') === 'on',
      is_featured: formData.get('is_featured') === 'on'
    };
  }

  /**
   * Create/edit modal. The edit handler was previously an empty stub
   * ("// open edit modal") and the create buttons had no listener at all.
   */
  function openProgramModal(id) {
    var load = id
      ? api.apiRequest('/admin/programs/' + id)
      : Promise.resolve(null);

    return load.then(function(program) {
      shared.openModal({
        title: id ? 'Edit program' : 'Add program',
        submitLabel: id ? 'Save changes' : 'Create program',
        contentHtml: programFormHtml(program),
        onSubmit: function(formData, close) {
          var payload = readProgramForm(formData);
          if (!payload.title || payload.title.length < 3) {
            showToast('Title must be at least 3 characters', 'error');
            return;
          }
          if (!payload.start_datetime) {
            showToast('A start date and time is required', 'error');
            return;
          }

          var request = id
            ? api.put('/admin/programs/' + id, payload)
            : api.post('/admin/programs', payload);

          return request.then(function() {
            showToast(id ? 'Program updated' : 'Program created', 'success');
            close();
            loadPrograms(id ? currentPage : 1);
          }).catch(function(error) {
            showToast(error.message || 'Failed to save program', 'error');
          });
        }
      });
    }).catch(function(error) {
      showToast(error.message || 'Failed to load program', 'error');
    });
  }

  function initCreateButtons() {
    ['add-program-header-btn', 'new-program-sidebar-btn', 'new-record-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function() { openProgramModal(null); });
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.programsAdmin = {
    init: function() {
      if (!auth.requireAuth()) return;
      loadPrograms(1);
      initCreateButtons();
    },
    loadPrograms: loadPrograms
  };

})();