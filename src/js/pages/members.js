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
      if (data.totalPages > 1) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.page,
          data.totalPages,
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

    document.querySelectorAll('.edit-member-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openEditMember(Number(this.getAttribute('data-id')));
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

  function memberFormHtml(member) {
    member = member || {};
    var text = function(name, label, value, attrs) {
      return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="m-' + name + '">' + label + '</label>' +
        '<input id="m-' + name + '" name="' + name + '" ' + (attrs || '') +
          ' class="w-full bg-surface-container-highest rounded-lg px-4 py-3"' +
          ' value="' + escapeHtml(value == null ? '' : value) + '"/>' +
      '</div>';
    };
    var select = function(name, label, value, options) {
      return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="m-' + name + '">' + label + '</label>' +
        '<select id="m-' + name + '" name="' + name + '" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
          options.map(function(opt) {
            return '<option value="' + opt + '"' + (String(value) === opt ? ' selected' : '') + '>' + opt + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    };

    return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
      text('first_name', 'First name', member.first_name, 'required maxlength="50"') +
      text('last_name', 'Last name', member.last_name, 'required maxlength="50"') +
      text('email', 'Email', member.email, 'type="email" maxlength="100"') +
      text('phone', 'Phone', member.phone, 'maxlength="20"') +
      text('dob', 'Date of birth', member.dob ? String(member.dob).slice(0, 10) : '', 'type="date"') +
      text('joined_date', 'Joined date', member.joined_date ? String(member.joined_date).slice(0, 10) : '', 'type="date"') +
      select('gender', 'Gender', member.gender, ['', 'male', 'female', 'other']) +
      select('member_type', 'Member type', member.member_type || 'adult', ['adult', 'youth', 'child']) +
      text('department', 'Department', member.department, 'maxlength="50"') +
      text('occupation', 'Occupation', member.occupation, 'maxlength="100"') +
    '</div>' +
    '<div class="mt-4">' +
      '<label class="block text-xs font-bold text-primary mb-1" for="m-address">Address</label>' +
      '<textarea id="m-address" name="address" rows="2" maxlength="500" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
        escapeHtml(member.address || '') +
      '</textarea>' +
    '</div>' +
    '<label class="flex items-center gap-2 text-sm font-semibold mt-3">' +
      '<input type="checkbox" name="baptism_status" ' + (member.baptism_status ? 'checked' : '') + '/> Baptised' +
    '</label>';
  }

  function readMemberForm(formData) {
    var value = function(name) {
      var raw = formData.get(name);
      return raw === null || String(raw).trim() === '' ? null : String(raw).trim();
    };

    return {
      first_name: value('first_name'),
      last_name: value('last_name'),
      email: value('email'),
      phone: value('phone'),
      address: value('address'),
      dob: value('dob'),
      gender: value('gender'),
      occupation: value('occupation'),
      member_type: value('member_type'),
      department: value('department'),
      joined_date: value('joined_date'),
      baptism_status: formData.get('baptism_status') === 'on'
    };
  }

  /** "Add member" existed as a button in the HTML but had no handler. */
  function openCreateMember() {
    shared.openModal({
      title: 'Add member',
      submitLabel: 'Create member',
      contentHtml: memberFormHtml(),
      onSubmit: function(formData, close) {
        var payload = readMemberForm(formData);
        if (!payload.first_name || !payload.last_name) {
          showToast('First and last name are required', 'error');
          return;
        }
        return api.post('/members', payload).then(function() {
          showToast('Member created', 'success');
          close();
          loadMembers(1, currentSearch);
        }).catch(function(error) {
          showToast(error.message || 'Failed to create member', 'error');
        });
      }
    });
  }

  function openEditMember(id) {
    return api.apiRequest('/members/' + id).then(function(member) {
      shared.openModal({
        title: 'Edit member',
        submitLabel: 'Save changes',
        contentHtml: memberFormHtml(member),
        onSubmit: function(formData, close) {
          return api.put('/members/' + id, readMemberForm(formData)).then(function() {
            showToast('Member updated', 'success');
            close();
            loadMembers(currentPage, currentSearch);
          }).catch(function(error) {
            showToast(error.message || 'Failed to update member', 'error');
          });
        }
      });
    }).catch(function(error) {
      showToast(error.message || 'Failed to load member', 'error');
    });
  }

  function initCreateButtons() {
    ['add-member-btn', 'new-member-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openCreateMember);
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.members = {
    init: function() {
      if (!auth.requireAuth()) return;
      loadMembers(1);
      initSearch();
      initCreateButtons();
    },
    openCreateMember: openCreateMember,
    openEditMember: openEditMember,
    loadMembers: loadMembers,
    renderMembersTable: renderMembersTable
  };

})();