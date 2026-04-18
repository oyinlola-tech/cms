(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var showToast = shared ? shared.showToast : function() {};

  function loadUserProfile() {
    return api.apiRequest('/auth/me').then(function(data) {
      renderUserProfile(data);
    }).catch(function(error) {
      console.error('Failed to load user profile:', error);
    });
  }

  function renderUserProfile(user) {
    var nameInput = document.querySelector('input[name="name"]');
    var emailInput = document.querySelector('input[name="email"]');
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
  }

  function initProfileForm() {
    var form = document.getElementById('profile-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var formData = new FormData(form);
      var data = {
        name: formData.get('name'),
        email: formData.get('email')
      };

      api.apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data)
      }).then(function() {
        showToast('Profile updated successfully', 'success');
      }).catch(function(error) {
        showToast(error.message || 'Failed to update profile', 'error');
      });
    });
  }

  function loadContactMessages(page, search, unreadOnly) {
    page = page || 1;
    var url = '/admin/contact/messages?page=' + page;
    if (search) url += '&search=' + encodeURIComponent(search);
    if (unreadOnly) url += '&unread=1';

    return api.apiRequest(url).then(function(data) {
      renderContactMessages(data.items || []);
    }).catch(function(error) {
      console.error('Failed to load contact messages:', error);
    });
  }

  function renderContactMessages(messages) {
    var tbody = document.querySelector('#contact-messages-table tbody');
    if (!tbody) return;

    if (!messages || messages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-on-surface-variant">No messages</td></tr>';
      return;
    }

    var html = '';
    messages.forEach(function(msg) {
      html += '<tr class="' + (msg.is_read ? '' : 'bg-primary/5 font-bold') + '">' +
        '<td>' + escapeHtml(msg.name) + '</td>' +
        '<td>' + escapeHtml(msg.email) + '</td>' +
        '<td>' + escapeHtml(msg.subject) + '</td>' +
        '<td>' + escapeHtml(msg.message.substring(0, 50)) + '...</td>' +
        '<td>' +
          '<button class="text-primary hover:underline text-sm mr-2 view-message-btn" data-id="' + msg.id + '">View</button>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.settings = {
    init: function() {
      shared.init();
      if (!auth.requireAuth()) return;
      loadUserProfile();
      initProfileForm();
      loadContactMessages(1);
    },
    loadUserProfile: loadUserProfile,
    loadContactMessages: loadContactMessages
  };

})();