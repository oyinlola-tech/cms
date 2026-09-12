(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var formatTime = shared ? shared.formatTime : function(d) { return d; };
  var showToast = shared ? shared.showToast : function() {};

  var currentPage = 1;
  var currentSearch = '';
  var currentStatus = '';

  var STATUS_STYLES = {
    upcoming: 'bg-primary/10 text-primary',
    ongoing: 'bg-secondary-container text-on-secondary-container',
    completed: 'bg-surface-container-high text-on-surface-variant',
    cancelled: 'bg-error-container text-on-error-container'
  };

  // ------------------------------------------------------------------- list

  function loadPrograms(page, search, status) {
    currentPage = page || 1;
    if (search !== undefined) currentSearch = search;
    if (status !== undefined) currentStatus = status;

    var url = '/admin/programs?page=' + currentPage;
    if (currentSearch) url += '&search=' + encodeURIComponent(currentSearch);
    if (currentStatus) url += '&status=' + encodeURIComponent(currentStatus);

    return api.apiRequest(url).then(function(data) {
      renderProgramsTable(data.items || []);
      renderPagination(data);
    }).catch(function(error) {
      console.error('Failed to load programs:', error);
      showToast(error.message || 'Failed to load programs', 'error');
    });
  }

  function loadStats() {
    return api.apiRequest('/admin/programs/stats').then(function(stats) {
      var el = document.getElementById('active-programs-count');
      if (el) el.textContent = Number(stats.upcoming || 0) + Number(stats.ongoing || 0);
    }).catch(function() { /* stats are decorative */ });
  }

  function loadMajorEvent() {
    return api.apiRequest('/dashboard/upcoming-event').then(function(event) {
      var title = document.getElementById('major-event-title');
      var when = document.getElementById('major-event-datetime');
      var daysLeft = document.getElementById('major-event-days-left');

      if (title) title.textContent = event.title || 'No upcoming program';
      if (when) when.textContent = event.date ? formatDate(event.date) + ' · ' + formatTime(event.date) : '--';
      if (daysLeft && event.date) {
        var diff = Math.ceil((new Date(event.date) - Date.now()) / 86400000);
        daysLeft.textContent = diff > 0 ? diff + (diff === 1 ? ' day' : ' days') : 'Today';
      }
    }).catch(function() { /* optional panel */ });
  }

  function renderPagination(data) {
    var info = document.getElementById('pagination-info');
    if (info) {
      info.textContent = data.total > 0
        ? 'Showing ' + data.from + '-' + data.to + ' of ' + data.total
        : 'No programs';
    }

    var controls = document.getElementById('pagination-controls');
    if (controls && shared.renderPaginationControls) {
      // The API returns a flat envelope; the old code read data.pagination.*,
      // which was always undefined so controls never rendered.
      shared.renderPaginationControls(controls, data.page, data.totalPages, function(page) {
        loadPrograms(page);
      });
    }
  }

  function renderProgramsTable(programs) {
    var tbody = document.getElementById('programs-table-body');
    if (!tbody) return;

    if (programs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No programs found</td></tr>';
      return;
    }

    tbody.innerHTML = programs.map(function(program) {
      var status = program.status || 'upcoming';
      return '<tr class="hover:bg-surface-container-low transition-colors">' +
        '<td class="px-6 py-4">' +
          '<div class="font-bold text-sm text-primary">' + escapeHtml(program.title) + '</div>' +
          (program.is_main_service ? '<div class="text-[10px] font-bold uppercase text-secondary">Main service</div>' : '') +
        '</td>' +
        '<td class="px-6 py-4 text-sm">' + escapeHtml(program.type || '') + '</td>' +
        '<td class="px-6 py-4 text-sm">' + escapeHtml(program.location || '—') + '</td>' +
        '<td class="px-6 py-4 text-sm whitespace-nowrap">' +
          (program.start_datetime ? escapeHtml(formatDate(program.start_datetime) + ' · ' + formatTime(program.start_datetime)) : '—') +
        '</td>' +
        '<td class="px-6 py-4">' +
          '<span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ' + (STATUS_STYLES[status] || '') + '">' +
            escapeHtml(status) +
          '</span>' +
        '</td>' +
        '<td class="px-6 py-4 text-right whitespace-nowrap">' +
          '<button type="button" class="text-primary hover:underline text-sm font-bold mr-3 edit-program-btn" data-id="' + program.id + '">Edit</button>' +
          '<button type="button" class="text-error hover:underline text-sm font-bold delete-program-btn" data-id="' + program.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    // The edit handler used to be an empty stub ("// open edit modal").
    tbody.querySelectorAll('.edit-program-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openModal(Number(this.getAttribute('data-id')));
      });
    });

    tbody.querySelectorAll('.delete-program-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this program?')) {
          deleteProgram(id);
        }
      });
    });
  }

  function deleteProgram(id) {
    return api.delete('/admin/programs/' + id).then(function() {
      showToast('Program deleted successfully', 'success');
      loadPrograms(currentPage);
      loadStats();
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete program', 'error');
    });
  }

  // ------------------------------------------------------------------ modal

  function modalEl() { return document.getElementById('program-modal'); }

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

  function resetForm() {
    var form = document.getElementById('program-form');
    if (form) form.reset();
    setField('program-id', '');
  }

  function openModal(id) {
    var modal = modalEl();
    if (!modal) return Promise.resolve();

    var heading = modal.querySelector('h3');

    var show = function() {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.classList.add('overflow-hidden');
    };

    if (!id) {
      resetForm();
      if (heading) heading.textContent = 'Create New Program';
      show();
      return Promise.resolve();
    }

    return api.apiRequest('/admin/programs/' + id).then(function(program) {
      resetForm();
      if (heading) heading.textContent = 'Edit Program';

      setField('program-id', program.id);
      setField('program-title', program.title);
      setField('program-type', program.type || 'service');
      setField('program-category', program.category || '');
      setField('program-location', program.location || '');
      setField('program-status', program.status || 'upcoming');
      setField('program-description', program.description || '');
      setField('program-main-service', program.is_main_service);
      setField('program-featured', program.is_featured);

      if (program.start_datetime) {
        var iso = String(program.start_datetime).replace(' ', 'T');
        setField('program-date', iso.slice(0, 10));
        setField('program-time', iso.slice(11, 16));
      }

      show();
    }).catch(function(error) {
      showToast(error.message || 'Failed to load program', 'error');
    });
  }

  function closeModal() {
    var modal = modalEl();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
    resetForm();
  }

  function submitForm(e) {
    e.preventDefault();

    var id = getField('program-id');
    var date = getField('program-date');
    var time = getField('program-time');

    if (!getField('program-title')) {
      showToast('Program title is required', 'error');
      return;
    }
    if (!date || !time) {
      showToast('A start date and time is required', 'error');
      return;
    }

    var payload = {
      title: getField('program-title'),
      description: getField('program-description'),
      type: getField('program-type') || 'service',
      category: getField('program-category'),
      location: getField('program-location'),
      // The form splits date and time; the API stores a single DATETIME.
      start_datetime: date + ' ' + time + ':00',
      status: getField('program-status') || 'upcoming',
      is_main_service: getField('program-main-service'),
      is_featured: getField('program-featured')
    };

    var form = document.getElementById('program-form');
    var submitBtn = form && form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    var request = id
      ? api.put('/admin/programs/' + id, payload)
      : api.post('/admin/programs', payload);

    return request.then(function() {
      showToast(id ? 'Program updated' : 'Program created', 'success');
      closeModal();
      loadPrograms(id ? currentPage : 1);
      loadStats();
    }).catch(function(error) {
      showToast(error.message || 'Failed to save program', 'error');
    }).finally(function() {
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  // ------------------------------------------------------------------- init

  function initModal() {
    var form = document.getElementById('program-form');
    if (form) form.addEventListener('submit', submitForm);

    ['close-modal-btn', 'cancel-modal-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', closeModal);
    });

    var modal = modalEl();
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal();
    });

    // None of these create buttons had a listener before.
    ['add-program-header-btn', 'new-program-sidebar-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function() { openModal(null); });
    });
  }

  function initFilters() {
    var search = document.getElementById('program-search');
    if (search) {
      var doSearch = shared.debounce(function(value) { loadPrograms(1, value); }, 400);
      search.addEventListener('input', function() { doSearch(this.value); });
    }

    var filters = document.getElementById('category-filters');
    if (filters) {
      filters.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-status]');
        if (!btn) return;
        loadPrograms(1, currentSearch, btn.getAttribute('data-status') || '');
      });
    }
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.programsAdmin = {
    init: function() {
      if (!auth.requireAuth()) return;
      initModal();
      initFilters();
      loadPrograms(1);
      loadStats();
      loadMajorEvent();
    },
    loadPrograms: loadPrograms,
    openModal: openModal
  };

})();
