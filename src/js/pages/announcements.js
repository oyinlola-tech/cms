(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var showToast = shared ? shared.showToast : function() {};

  var currentPage = 1;
  var currentSearch = '';
  var currentStatus = '';

  var STATUS_STYLES = {
    published: 'bg-primary/10 text-primary',
    draft: 'bg-surface-container-high text-on-surface-variant',
    scheduled: 'bg-secondary-container text-on-secondary-container',
    archived: 'bg-surface-container-high text-on-surface-variant opacity-70'
  };

  // ------------------------------------------------------------------- list

  function loadAnnouncements(page, search, status) {
    currentPage = page || 1;
    if (search !== undefined) currentSearch = search;
    if (status !== undefined) currentStatus = status;

    var url = '/admin/announcements?page=' + currentPage;
    if (currentSearch) url += '&search=' + encodeURIComponent(currentSearch);
    if (currentStatus) url += '&status=' + encodeURIComponent(currentStatus);

    return api.apiRequest(url).then(function(data) {
      renderTable(data.items || []);
      renderPagination(data);
    }).catch(function(error) {
      console.error('Failed to load announcements:', error);
      showToast(error.message || 'Failed to load announcements', 'error');
    });
  }

  function loadStats() {
    return api.apiRequest('/admin/announcements/stats').then(function(stats) {
      var map = {
        'active-announcements-count': stats.published,
        'draft-announcements-count': stats.draft,
        'scheduled-announcements-count': stats.scheduled,
        'total-reach-count': stats.totalReach
      };
      Object.keys(map).forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = Number(map[id] || 0);
      });
    }).catch(function() { /* stats are decorative */ });
  }

  function renderPagination(data) {
    var info = document.getElementById('pagination-info');
    if (info) {
      info.textContent = data.total > 0
        ? 'Showing ' + data.from + '-' + data.to + ' of ' + data.total
        : 'No announcements';
    }

    var controls = document.getElementById('pagination-controls');
    if (controls && shared.renderPaginationControls) {
      shared.renderPaginationControls(controls, data.page, data.totalPages, function(page) {
        loadAnnouncements(page);
      });
    }
  }

  function renderTable(items) {
    var tbody = document.getElementById('announcements-table-body');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-on-surface-variant">No announcements found</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function(item) {
      var status = item.status || 'draft';
      return '<tr class="hover:bg-surface-container-low transition-colors">' +
        '<td class="px-6 py-4">' +
          '<div class="font-bold text-sm text-primary">' + escapeHtml(item.title) + '</div>' +
          '<div class="text-xs text-on-surface-variant line-clamp-1">' + escapeHtml(item.summary || '') + '</div>' +
        '</td>' +
        '<td class="px-6 py-4 text-sm">' + escapeHtml(item.category || 'General') + '</td>' +
        '<td class="px-6 py-4">' +
          '<span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ' + (STATUS_STYLES[status] || '') + '">' +
            escapeHtml(status) +
          '</span>' +
        '</td>' +
        '<td class="px-6 py-4 text-sm whitespace-nowrap text-on-surface-variant">' +
          escapeHtml(formatDate(item.published_at || item.scheduled_for || item.created_at)) +
        '</td>' +
        '<td class="px-6 py-4 text-right whitespace-nowrap">' +
          '<button type="button" class="text-primary hover:underline text-sm font-bold mr-3 edit-announcement-btn" data-id="' + item.id + '">Edit</button>' +
          '<button type="button" class="text-error hover:underline text-sm font-bold delete-announcement-btn" data-id="' + item.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    // The edit handler used to be an empty stub ("// open edit modal").
    tbody.querySelectorAll('.edit-announcement-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openModal(Number(this.getAttribute('data-id')));
      });
    });

    tbody.querySelectorAll('.delete-announcement-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this announcement?')) {
          deleteAnnouncement(id);
        }
      });
    });
  }

  function deleteAnnouncement(id) {
    return api.delete('/admin/announcements/' + id).then(function() {
      showToast('Announcement deleted successfully', 'success');
      loadAnnouncements(currentPage);
      loadStats();
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete announcement', 'error');
    });
  }

  // ------------------------------------------------------------------ modal

  function modalEl() { return document.getElementById('announcement-modal'); }

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

  function setPriority(priority) {
    setField('announcement-priority', priority || 'normal');
    var selector = document.getElementById('priority-selector');
    if (!selector) return;

    selector.querySelectorAll('.priority-btn').forEach(function(btn) {
      var active = btn.getAttribute('data-priority') === (priority || 'normal');
      btn.classList.toggle('bg-surface', active);
      btn.classList.toggle('text-primary', active);
      btn.classList.toggle('shadow-sm', active);
      btn.classList.toggle('text-on-surface-variant', !active);
    });
  }

  function resetForm() {
    var form = document.getElementById('announcement-form');
    if (form) form.reset();
    setField('announcement-id', '');
    setPriority('normal');
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
      if (heading) heading.textContent = 'New Announcement';
      show();
      return Promise.resolve();
    }

    return api.apiRequest('/admin/announcements/' + id).then(function(item) {
      resetForm();
      if (heading) heading.textContent = 'Edit Announcement';

      setField('announcement-id', item.id);
      setField('announcement-title', item.title);
      setField('announcement-summary', item.summary);
      setField('announcement-content', item.content);
      setField('announcement-category', item.category || 'Admin');
      setField('announcement-status', item.status || 'draft');
      setField('announcement-image-url', item.image_url);
      setPriority(item.priority || 'normal');

      if (item.scheduled_for) {
        setField('announcement-scheduled-for', String(item.scheduled_for).replace(' ', 'T').slice(0, 16));
      }

      show();
    }).catch(function(error) {
      showToast(error.message || 'Failed to load announcement', 'error');
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

  function collectPayload(overrideStatus) {
    var status = overrideStatus || getField('announcement-status') || 'draft';
    return {
      title: getField('announcement-title'),
      summary: getField('announcement-summary'),
      content: getField('announcement-content'),
      category: getField('announcement-category') || 'General',
      priority: getField('announcement-priority') || 'normal',
      status: status,
      // Only a scheduled announcement carries a publish time.
      scheduled_for: status === 'scheduled' ? getField('announcement-scheduled-for') : null,
      image_url: getField('announcement-image-url')
    };
  }

  function save(overrideStatus) {
    var id = getField('announcement-id');
    var payload = collectPayload(overrideStatus);

    if (!payload.title || payload.title.length < 3) {
      showToast('Title must be at least 3 characters', 'error');
      return Promise.resolve();
    }
    if (payload.status === 'scheduled' && !payload.scheduled_for) {
      showToast('A scheduled announcement needs a publish date and time', 'error');
      return Promise.resolve();
    }

    var request = id
      ? api.put('/admin/announcements/' + id, payload)
      : api.post('/admin/announcements', payload);

    return request.then(function() {
      showToast(id ? 'Announcement updated' : 'Announcement created', 'success');
      closeModal();
      loadAnnouncements(id ? currentPage : 1);
      loadStats();
    }).catch(function(error) {
      showToast(error.message || 'Failed to save announcement', 'error');
    });
  }

  // ------------------------------------------------------------------- init

  function initModal() {
    var form = document.getElementById('announcement-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        // The submit button is "Publish"; the status field still wins if the
        // editor explicitly chose scheduled or archived.
        var chosen = getField('announcement-status');
        save(chosen === 'draft' ? 'published' : chosen);
      });
    }

    // "Save draft" had no handler at all.
    var draftBtn = document.getElementById('save-draft-btn');
    if (draftBtn) {
      draftBtn.addEventListener('click', function(e) {
        e.preventDefault();
        save('draft');
      });
    }

    var selector = document.getElementById('priority-selector');
    if (selector) {
      selector.addEventListener('click', function(e) {
        var btn = e.target.closest('.priority-btn');
        if (btn) setPriority(btn.getAttribute('data-priority'));
      });
    }

    var statusSelect = document.getElementById('announcement-status');
    var scheduledInput = document.getElementById('announcement-scheduled-for');
    if (statusSelect && scheduledInput) {
      var syncScheduled = function() {
        scheduledInput.disabled = statusSelect.value !== 'scheduled';
      };
      statusSelect.addEventListener('change', syncScheduled);
      syncScheduled();
    }

    var closeBtn = document.getElementById('close-modal-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    var modal = modalEl();
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal();
    });

    // None of these create buttons had listeners before.
    ['create-announcement-header-btn', 'new-announcement-sidebar-btn', 'fab-create-announcement'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function() { openModal(null); });
    });
  }

  function initFilters() {
    var search = document.getElementById('announcement-search');
    if (search) {
      var doSearch = shared.debounce(function(value) { loadAnnouncements(1, value); }, 400);
      search.addEventListener('input', function() { doSearch(this.value); });
    }
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.announcementsAdmin = {
    init: function() {
      if (!auth.requireAuth()) return;
      initModal();
      initFilters();
      loadAnnouncements(1);
      loadStats();
    },
    loadAnnouncements: loadAnnouncements,
    openModal: openModal
  };

})();
