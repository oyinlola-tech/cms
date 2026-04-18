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
  var currentSearch = '';
  var selectedIds = [];

  function loadMembers(page, search) {
    page = page || 1;
    search = search || '';
    var url = '/members?page=' + page;
    if (search) url += '&search=' + encodeURIComponent(search);

    return api.apiRequest(url).then(function(data) {
      renderMembersTable(data.items || [], page === 1);
      if (data.pagination) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.pagination.page,
          data.pagination.totalPages,
          function(newPage) {
            currentPage = newPage;
            loadMembers(newPage, currentSearch);
          }
        );
      }
    }).catch(function(error) {
      console.error('Failed to load members:', error);
    });
  }

  function renderMembersTable(members, replace) {
    replace = replace !== false;
    var tbody = document.querySelector('#members-table tbody');
    if (!tbody) return;

    if (!members || members.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No members found</td></tr>';
      return;
    }

    var html = '';
    members.forEach(function(member) {
      var isSelected = selectedIds.indexOf(member.id) !== -1;
      html += '<tr class="' + (isSelected ? 'bg-primary/5' : '') + '">' +
        '<td class="pl-4"><input type="checkbox" class="member-checkbox" data-id="' + member.id + '" ' + (isSelected ? 'checked' : '') + '></td>' +
        '<td>' + escapeHtml(member.name) + '</td>' +
        '<td>' + escapeHtml(member.email || '—') + '</td>' +
        '<td>' + escapeHtml(member.phone || '—') + '</td>' +
        '<td>' + (member.birthday ? formatDate(member.birthday) : '—') + '</td>' +
        '<td>' +
          '<button class="text-primary hover:underline text-sm delete-member-btn" data-id="' + member.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;

    document.querySelectorAll('.member-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (this.checked) {
          selectedIds.push(id);
        } else {
          var idx = selectedIds.indexOf(id);
          if (idx > -1) selectedIds.splice(idx, 1);
        }
      });
    });

    document.querySelectorAll('.delete-member-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this member?')) {
          deleteMember(id);
        }
      });
    });
  }

  function deleteMember(id) {
    return api.apiRequest('/members/' + id, { method: 'DELETE' }).then(function() {
      showToast('Member deleted successfully', 'success');
      loadMembers(currentPage, currentSearch);
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete member', 'error');
    });
  }

  function initSearch() {
    var searchInput = document.getElementById('member-search');
    if (!searchInput) return;

    var doSearch = debounce(function(value) {
      currentSearch = value;
      currentPage = 1;
      loadMembers(1, value);
    }, 500);

    searchInput.addEventListener('input', function() {
      doSearch(this.value);
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.members = {
    init: function() {
      shared.init();
      if (!auth.requireAuth()) return;
      loadMembers(1);
      initSearch();
    },
    loadMembers: loadMembers,
    renderMembersTable: renderMembersTable
  };

})();