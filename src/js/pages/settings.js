(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var showToast = shared ? shared.showToast : function() {};
  var validatePasswordStrength = shared ? shared.validatePasswordStrength : function() { return []; };

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

      api.put('/auth/profile', data).then(function() {
        showToast('Profile updated successfully', 'success');
      }).catch(function(error) {
        showToast(error.message || 'Failed to update profile', 'error');
      });
    });
  }

  var currentPage = 1;
  var currentSearch = '';
  var currentUnreadOnly = false;

  function loadContactMessages(page, search, unreadOnly) {
    page = page || 1;
    currentPage = page;
    currentSearch = search || '';
    currentUnreadOnly = Boolean(unreadOnly);
    var url = '/admin/contact/messages?page=' + page;
    if (search) url += '&search=' + encodeURIComponent(search);
    if (unreadOnly) url += '&unreadOnly=true';

    return api.apiRequest(url).then(function(data) {
      renderContactMessages(data.items || []);
      if (data.totalPages > 1) {
        shared.renderPaginationControls(
          document.getElementById('messages-pagination'),
          data.page,
          data.totalPages,
          function(newPage) { loadContactMessages(newPage, currentSearch, currentUnreadOnly); }
        );
      }
    }).catch(function(error) {
      console.error('Failed to load contact messages:', error);
      showToast(error.message || 'Failed to load messages', 'error');
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
      var body = String(msg.message || '');
      var preview = body.length > 50 ? body.substring(0, 50) + '\u2026' : body;

      html += '<tr class="' + (msg.isRead ? '' : 'bg-primary/5 font-bold') + '">' +
        '<td class="px-4 py-3">' + escapeHtml(msg.name) + '</td>' +
        '<td class="px-4 py-3">' + escapeHtml(msg.email) + '</td>' +
        '<td class="px-4 py-3">' + escapeHtml(msg.subject || '(no subject)') + '</td>' +
        '<td class="px-4 py-3">' + escapeHtml(preview) + '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">' +
          '<button type="button" class="text-primary hover:underline text-sm mr-3 view-message-btn" data-id="' + msg.id + '">View</button>' +
          '<button type="button" class="text-secondary hover:underline text-sm reply-message-btn" data-id="' + msg.id + '">Reply</button>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;

    // These buttons previously had no listeners at all.
    tbody.querySelectorAll('.view-message-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        var msg = messages.find(function(m) { return Number(m.id) === id; });
        if (msg) viewMessage(msg);
      });
    });

    tbody.querySelectorAll('.reply-message-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = Number(this.getAttribute('data-id'));
        var msg = messages.find(function(m) { return Number(m.id) === id; });
        if (msg) replyToMessage(msg);
      });
    });
  }

  function viewMessage(msg) {
    shared.openModal({
      title: msg.subject || '(no subject)',
      submitLabel: 'Mark as read',
      contentHtml:
        '<div class="space-y-3 text-sm">' +
          '<div><span class="font-bold">From:</span> ' + escapeHtml(msg.name) + ' &lt;' + escapeHtml(msg.email) + '&gt;</div>' +
          (msg.phone ? '<div><span class="font-bold">Phone:</span> ' + escapeHtml(msg.phone) + '</div>' : '') +
          '<div><span class="font-bold">Received:</span> ' + escapeHtml(shared.formatDate(msg.createdAt)) + '</div>' +
          '<div class="pt-2 border-t border-outline-variant/20 whitespace-pre-wrap leading-relaxed">' +
            escapeHtml(msg.message || '') +
          '</div>' +
        '</div>',
      onSubmit: function(formData, close) {
        return api.apiRequest('/admin/contact/messages/' + msg.id + '/read', { method: 'PUT' })
          .then(function() {
            showToast('Marked as read', 'success');
            close();
            loadContactMessages(currentPage, currentSearch, currentUnreadOnly);
          })
          .catch(function(error) {
            showToast(error.message || 'Failed to update message', 'error');
          });
      }
    });
  }

  function replyToMessage(msg) {
    shared.openModal({
      title: 'Reply to ' + msg.name,
      submitLabel: 'Send reply',
      contentHtml:
        '<label class="block text-xs font-bold text-primary mb-1" for="reply-subject">Subject</label>' +
        '<input id="reply-subject" name="subject" required minlength="3" maxlength="150" ' +
          'class="w-full bg-surface-container-highest rounded-lg px-4 py-3 mb-4" ' +
          'value="' + escapeHtml('Re: ' + (msg.subject || 'your message')) + '"/>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="reply-message">Message</label>' +
        '<textarea id="reply-message" name="message" required minlength="2" maxlength="10000" rows="7" ' +
          'class="w-full bg-surface-container-highest rounded-lg px-4 py-3"></textarea>',
      onSubmit: function(formData, close) {
        return api.post('/admin/contact/messages/' + msg.id + '/reply', {
          subject: formData.get('subject'),
          message: formData.get('message')
        }).then(function() {
          showToast('Reply sent', 'success');
          close();
          loadContactMessages(currentPage, currentSearch, currentUnreadOnly);
        }).catch(function(error) {
          showToast(error.message || 'Failed to send reply', 'error');
        });
      }
    });
  }

  /**
   * The change-password form existed in settings.html but had no handler at
   * all, so the fields were inert.
   */
  function initPasswordForm() {
    var form = document.getElementById('password-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var formData = new FormData(form);
      var currentPassword = formData.get('current_password');
      var newPassword = formData.get('new_password');
      var confirmPassword = formData.get('confirm_password');

      if (confirmPassword !== null && newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
      }

      var errors = validatePasswordStrength(newPassword);
      if (errors.length > 0) {
        showToast(errors[0], 'error');
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      api.post('/auth/change-password', {
        currentPassword: currentPassword,
        newPassword: newPassword
      }).then(function(data) {
        // Changing the password revokes existing sessions; the server hands
        // back a fresh token so this tab stays signed in.
        if (data && data.token) {
          localStorage.setItem('authToken', data.token);
        }
        showToast('Password changed. Other sessions have been signed out.', 'success');
        form.reset();
      }).catch(function(error) {
        showToast(error.message || 'Failed to change password', 'error');
      }).finally(function() {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  function initMessageFilters() {
    var searchInput = document.getElementById('message-search');
    if (searchInput) {
      var doSearch = shared.debounce(function(value) {
        loadContactMessages(1, value, currentUnreadOnly);
      }, 400);
      searchInput.addEventListener('input', function() { doSearch(this.value); });
    }

    var unreadToggle = document.getElementById('unread-only-toggle');
    if (unreadToggle) {
      unreadToggle.addEventListener('change', function() {
        loadContactMessages(1, currentSearch, this.checked);
      });
    }
  }

  /**
   * External links (Join Service / Watch Online) had a backend on both ends
   * but no UI, so they could never be edited.
   */
  function loadExternalLinks() {
    var container = document.getElementById('external-links');
    if (!container) return Promise.resolve();

    return api.apiRequest('/admin/settings/links').then(function(links) {
      renderExternalLinks(container, links || []);
    }).catch(function(error) {
      console.error('Failed to load links:', error);
    });
  }

  function renderExternalLinks(container, links) {
    container.textContent = '';

    var form = document.createElement('form');
    form.className = 'space-y-4';

    links.forEach(function(link) {
      var wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col gap-1';

      var label = document.createElement('label');
      label.className = 'text-xs font-bold text-primary px-1';
      label.textContent = link.label || link.key;
      label.setAttribute('for', 'link-' + link.key);

      var input = document.createElement('input');
      input.type = 'url';
      input.id = 'link-' + link.key;
      input.name = link.key;
      input.value = link.url || '';
      input.placeholder = 'https://example.com/...';
      input.className = 'bg-surface-container-highest border-b border-outline-variant/20 rounded-t-lg px-4 py-3 focus:outline-none focus:border-primary transition-all';

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      form.appendChild(wrapper);
    });

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'px-5 py-2 rounded-xl font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity';
    submit.textContent = 'Save links';
    form.appendChild(submit);

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      submit.disabled = true;

      var payload = links.map(function(link) {
        var field = form.querySelector('[name="' + link.key + '"]');
        return { key: link.key, url: field ? field.value.trim() : '' };
      });

      api.put('/admin/settings/links', { links: payload }).then(function() {
        showToast('Links updated', 'success');
      }).catch(function(error) {
        showToast(error.message || 'Failed to update links', 'error');
      }).finally(function() {
        submit.disabled = false;
      });
    });

    container.appendChild(form);
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.settings = {
    init: function() {
      if (!auth.requireAuth()) return;
      loadUserProfile();
      initProfileForm();
      initPasswordForm();
      initMessageFilters();
      loadContactMessages(1);
      loadExternalLinks();
    },
    loadUserProfile: loadUserProfile,
    loadContactMessages: loadContactMessages,
    loadExternalLinks: loadExternalLinks
  };

})();