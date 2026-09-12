(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var showToast = shared ? shared.showToast : function() {};

  var ROLES = ['viewer', 'editor', 'admin', 'super_admin'];
  var ROLE_RANK = { viewer: 0, editor: 1, admin: 2, super_admin: 3 };

  var currentPage = 1;

  function loadUsers(page) {
    page = page || 1;
    currentPage = page;

    return api.apiRequest('/admin/users?page=' + page).then(function(data) {
      renderUsers(data.items || []);
      if (data.totalPages > 1) {
        shared.renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.page,
          data.totalPages,
          loadUsers
        );
      }
    }).catch(function(error) {
      if (error.status === 403) {
        var notice = document.getElementById('users-permission-notice');
        if (notice) notice.hidden = false;
        var addBtn = document.getElementById('add-user-btn');
        if (addBtn) addBtn.hidden = true;
        return;
      }
      showToast(error.message || 'Failed to load users', 'error');
    });
  }

  function renderUsers(users) {
    var tbody = document.querySelector('#users-table tbody');
    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No users found</td></tr>';
      return;
    }

    var me = auth.getCurrentUser() || {};

    tbody.innerHTML = users.map(function(user) {
      var isSelf = Number(user.id) === Number(me.id);
      return '<tr>' +
        '<td class="px-6 py-4 font-semibold">' + escapeHtml(user.name) +
          (isSelf ? ' <span class="text-xs font-normal text-on-surface-variant">(you)</span>' : '') + '</td>' +
        '<td class="px-6 py-4">' + escapeHtml(user.email) + '</td>' +
        '<td class="px-6 py-4"><span class="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-bold">' +
          escapeHtml(user.role) + '</span></td>' +
        '<td class="px-6 py-4">' + (user.isActive
          ? '<span class="text-primary font-semibold">Active</span>'
          : '<span class="text-error font-semibold">Disabled</span>') + '</td>' +
        '<td class="px-6 py-4 text-on-surface-variant">' +
          (user.lastLogin ? escapeHtml(formatDate(user.lastLogin)) : 'Never') + '</td>' +
        '<td class="px-6 py-4 text-right whitespace-nowrap">' +
          (isSelf ? '<span class="text-xs text-on-surface-variant">—</span>' :
            '<button type="button" class="text-primary hover:underline text-sm mr-3 edit-user-btn" data-id="' + user.id + '">Edit</button>' +
            '<button type="button" class="text-error hover:underline text-sm delete-user-btn" data-id="' + user.id + '">Delete</button>') +
        '</td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.edit-user-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        openEditUser(users.find(function(u) { return Number(u.id) === id; }));
      });
    });

    tbody.querySelectorAll('.delete-user-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        var user = users.find(function(u) { return Number(u.id) === id; });
        if (!user) return;
        if (confirm('Delete the account for ' + user.email + '? This cannot be undone.')) {
          deleteUser(id);
        }
      });
    });
  }

  function assignableRoles() {
    // The server refuses any role at or above the caller's own; mirror that
    // here so the picker cannot offer something that will be rejected.
    var myRole = auth.getRole() || 'viewer';
    var myRank = ROLE_RANK[myRole] || 0;
    return ROLES.filter(function(role) { return ROLE_RANK[role] < myRank; });
  }

  function roleOptions(selected) {
    var options = assignableRoles();
    if (options.length === 0) {
      return '<option value="">No assignable roles</option>';
    }
    return options.map(function(role) {
      return '<option value="' + role + '"' + (role === selected ? ' selected' : '') + '>' + role + '</option>';
    }).join('');
  }

  function openCreateUser() {
    if (assignableRoles().length === 0) {
      showToast('Your role cannot create other accounts', 'error');
      return;
    }

    shared.openModal({
      title: 'Add user',
      submitLabel: 'Create user',
      contentHtml:
        '<div class="space-y-4">' +
          '<div><label class="block text-xs font-bold text-primary mb-1" for="u-name">Name</label>' +
            '<input id="u-name" name="name" required minlength="2" maxlength="100" class="w-full bg-surface-container-highest rounded-lg px-4 py-3"/></div>' +
          '<div><label class="block text-xs font-bold text-primary mb-1" for="u-email">Email</label>' +
            '<input id="u-email" name="email" type="email" required class="w-full bg-surface-container-highest rounded-lg px-4 py-3"/></div>' +
          '<div><label class="block text-xs font-bold text-primary mb-1" for="u-password">Temporary password</label>' +
            '<input id="u-password" name="password" type="password" required class="w-full bg-surface-container-highest rounded-lg px-4 py-3"/>' +
            '<p class="text-xs text-on-surface-variant mt-1">At least 8 characters with upper, lower, a number and a symbol.</p></div>' +
          '<div><label class="block text-xs font-bold text-primary mb-1" for="u-role">Role</label>' +
            '<select id="u-role" name="role" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' + roleOptions('viewer') + '</select></div>' +
        '</div>',
      onSubmit: function(formData, close) {
        var password = formData.get('password');
        var errors = shared.validatePasswordStrength(password);
        if (errors.length > 0) {
          showToast(errors[0], 'error');
          return;
        }

        return api.post('/admin/users', {
          name: formData.get('name'),
          email: formData.get('email'),
          password: password,
          role: formData.get('role')
        }).then(function() {
          showToast('User created', 'success');
          close();
          loadUsers(1);
        }).catch(function(error) {
          showToast(error.message || 'Failed to create user', 'error');
        });
      }
    });
  }

  function openEditUser(user) {
    if (!user) return;

    shared.openModal({
      title: 'Edit ' + user.name,
      submitLabel: 'Save changes',
      contentHtml:
        '<div class="space-y-4">' +
          '<div><label class="block text-xs font-bold text-primary mb-1" for="u-name">Name</label>' +
            '<input id="u-name" name="name" required minlength="2" maxlength="100" class="w-full bg-surface-container-highest rounded-lg px-4 py-3" value="' + escapeHtml(user.name) + '"/></div>' +
          '<div><label class="block text-xs font-bold text-primary mb-1" for="u-role">Role</label>' +
            '<select id="u-role" name="role" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' + roleOptions(user.role) + '</select></div>' +
          '<label class="flex items-center gap-2 text-sm font-semibold">' +
            '<input type="checkbox" name="isActive" ' + (user.isActive ? 'checked' : '') + '/> Account active</label>' +
        '</div>',
      onSubmit: function(formData, close) {
        return api.put('/admin/users/' + user.id, {
          name: formData.get('name'),
          role: formData.get('role'),
          isActive: formData.get('isActive') === 'on'
        }).then(function() {
          showToast('User updated', 'success');
          close();
          loadUsers(currentPage);
        }).catch(function(error) {
          showToast(error.message || 'Failed to update user', 'error');
        });
      }
    });
  }

  function deleteUser(id) {
    return api.delete('/admin/users/' + id).then(function() {
      showToast('User deleted', 'success');
      loadUsers(currentPage);
    }).catch(function(error) {
      showToast(error.message || 'Failed to delete user', 'error');
    });
  }

  function initButtons() {
    ['add-user-btn', 'new-user-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openCreateUser);
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.users = {
    init: function() {
      if (!auth.requireAuth()) return;
      initButtons();
      loadUsers(1);
    },
    loadUsers: loadUsers,
    openCreateUser: openCreateUser
  };

})();
