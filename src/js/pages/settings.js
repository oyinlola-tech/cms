(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var showToast = shared ? shared.showToast : function() {};
  var validatePasswordStrength = shared ? shared.validatePasswordStrength : function() { return []; };

  // Maps the two fixed inputs in settings.html to their external_links keys.
  var LINK_FIELDS = [
    { key: 'join_service', inputId: 'link-join-service' },
    { key: 'watch_online', inputId: 'link-watch-online' }
  ];

  var currentPage = 1;
  var currentSearch = '';
  var currentUnreadOnly = false;

  // ---------------------------------------------------------------- profile

  function loadUserProfile() {
    return api.apiRequest('/auth/me').then(function(data) {
      renderUserProfile(data);
    }).catch(function(error) {
      console.error('Failed to load user profile:', error);
      showToast(error.message || 'Failed to load profile', 'error');
    });
  }

  function renderUserProfile(user) {
    var set = function(id, value) {
      var el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'INPUT') el.value = value == null ? '' : value;
        else el.textContent = value == null ? '--' : value;
      }
    };

    set('profile-name', user.name);
    set('profile-email', user.email);
    set('profile-role', user.role);
    set('last-login-time', user.lastLogin ? formatDate(user.lastLogin, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Never');
    set('last-login-ip', user.lastIp ? 'IP ' + user.lastIp : 'No recorded IP');
    set('twofa-status', user.twofaEnabled ? 'Enabled' : 'Disabled');
    // /auth/me no longer fabricates a session count, so show the honest value.
    set('active-sessions', 'This device');

    var sidebarName = document.getElementById('sidebar-admin-name');
    if (sidebarName) sidebarName.textContent = user.name || '';

    [document.getElementById('profile-avatar'), document.getElementById('sidebar-avatar')].forEach(function(img) {
      if (img && img.tagName === 'IMG') img.src = user.avatar || '/images/default-avatar.svg';
    });
  }

  function initProfileForm() {
    var form = document.getElementById('profile-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var formData = new FormData(form);
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      // `role` is display-only; the API rejects self-assigned roles.
      api.put('/auth/profile', {
        name: formData.get('name'),
        email: formData.get('email')
      }).then(function() {
        showToast('Profile updated successfully', 'success');
      }).catch(function(error) {
        showToast(error.message || 'Failed to update profile', 'error');
      }).finally(function() {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  // --------------------------------------------------------------- password

  /** The change-password form had no handler at all, so it was inert. */
  function initPasswordForm() {
    var form = document.getElementById('password-form');
    if (!form) return;

    var message = document.getElementById('password-message');
    var setMessage = function(text) {
      if (!message) return;
      message.textContent = text || '';
      message.classList.toggle('hidden', !text);
    };

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      setMessage('');

      var formData = new FormData(form);
      var currentPassword = formData.get('current_password');
      var newPassword = formData.get('new_password');
      var confirmPassword = formData.get('confirm_password');

      if (!currentPassword) {
        setMessage('Enter your current password.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setMessage('New passwords do not match.');
        return;
      }

      // Mirror the server policy so the API cannot reject a valid-looking form.
      var errors = validatePasswordStrength(newPassword);
      if (errors.length > 0) {
        setMessage(errors[0]);
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      api.post('/auth/change-password', {
        currentPassword: currentPassword,
        newPassword: newPassword
      }).then(function(data) {
        // Changing the password revokes every session; the server returns a
        // fresh token so this tab stays signed in.
        if (data && data.token) localStorage.setItem('authToken', data.token);
        showToast('Password changed. Other sessions have been signed out.', 'success');
        form.reset();
      }).catch(function(error) {
        setMessage(error.message || 'Failed to change password');
      }).finally(function() {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  // ---------------------------------------------------------- external links

  /**
   * These inputs existed in the markup and the API existed on both ends, but
   * nothing connected them, so the public "Watch Online" / "Join Our Service"
   * buttons could never be pointed anywhere.
   */
  function loadExternalLinks() {
    var form = document.getElementById('external-links-form');
    if (!form) return Promise.resolve();

    return api.apiRequest('/admin/settings/links').then(function(links) {
      (links || []).forEach(function(link) {
        var field = LINK_FIELDS.find(function(f) { return f.key === link.key; });
        if (!field) return;
        var input = document.getElementById(field.inputId);
        if (input) input.value = link.url || '';
      });
    }).catch(function(error) {
      console.error('Failed to load links:', error);
    });
  }

  function initExternalLinksForm() {
    var form = document.getElementById('external-links-form');
    if (!form) return;

    var status = document.getElementById('external-links-status');

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var payload = LINK_FIELDS.map(function(field) {
        var input = document.getElementById(field.inputId);
        return { key: field.key, url: input ? input.value.trim() : '' };
      });

      var invalid = payload.find(function(item) {
        return item.url && !/^https?:\/\//i.test(item.url);
      });
      if (invalid) {
        if (status) status.textContent = 'Links must start with http:// or https://';
        showToast('Links must start with http:// or https://', 'error');
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      if (status) status.textContent = 'Saving…';

      api.put('/admin/settings/links', { links: payload }).then(function() {
        if (status) status.textContent = 'Saved';
        showToast('Links updated', 'success');
      }).catch(function(error) {
        if (status) status.textContent = '';
        showToast(error.message || 'Failed to update links', 'error');
      }).finally(function() {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  // --------------------------------------------------------- contact inbox

  function loadContactMessages(page, search, unreadOnly) {
    currentPage = page || 1;
    currentSearch = search || '';
    currentUnreadOnly = Boolean(unreadOnly);

    var url = '/admin/contact/messages?page=' + currentPage;
    if (currentSearch) url += '&search=' + encodeURIComponent(currentSearch);
    // The API reads `unreadOnly=true`; the old code sent `unread=1`, which was
    // silently ignored so the filter never did anything.
    if (currentUnreadOnly) url += '&unreadOnly=true';

    return api.apiRequest(url).then(function(data) {
      renderContactMessages(data.items || []);
      renderPaginationInfo(data);
    }).catch(function(error) {
      console.error('Failed to load contact messages:', error);
      showToast(error.message || 'Failed to load messages', 'error');
    });
  }

  function renderPaginationInfo(data) {
    var info = document.getElementById('contact-pagination-info');
    if (info) {
      info.textContent = data.total > 0
        ? 'Showing ' + data.from + '-' + data.to + ' of ' + data.total
        : 'No messages';
    }

    var controls = document.getElementById('contact-pagination-controls');
    if (controls && shared.renderPaginationControls) {
      shared.renderPaginationControls(controls, data.page, data.totalPages, function(newPage) {
        loadContactMessages(newPage, currentSearch, currentUnreadOnly);
      });
    }
  }

  function renderContactMessages(messages) {
    var tbody = document.getElementById('contact-messages-body');
    if (!tbody) return;

    if (messages.length === 0) {
      tbody.innerHTML = '<tr><td class="px-6 py-6 text-sm text-on-surface-variant" colspan="4">No messages</td></tr>';
      return;
    }

    tbody.innerHTML = messages.map(function(msg) {
      // The API aliases the column to `isRead`; reading `is_read` meant the
      // unread highlight never applied.
      var unread = !msg.isRead;
      return '<tr class="' + (unread ? 'bg-primary/5' : '') + '">' +
        '<td class="px-6 py-4">' +
          (unread
            ? '<span class="bg-primary text-on-primary text-[10px] font-bold px-2 py-1 rounded-full">NEW</span>'
            : '<span class="text-[10px] font-bold text-on-surface-variant">Read</span>') +
        '</td>' +
        '<td class="px-6 py-4">' +
          '<div class="font-semibold text-sm">' + escapeHtml(msg.name) + '</div>' +
          '<div class="text-xs text-on-surface-variant">' + escapeHtml(msg.email) + '</div>' +
        '</td>' +
        '<td class="px-6 py-4 text-sm">' +
          escapeHtml(msg.subject || '(no subject)') +
          '<div class="mt-2 flex gap-3">' +
            '<button type="button" class="text-primary hover:underline text-xs font-bold view-message-btn" data-id="' + msg.id + '">View</button>' +
            '<button type="button" class="text-secondary hover:underline text-xs font-bold reply-message-btn" data-id="' + msg.id + '">Reply</button>' +
          '</div>' +
        '</td>' +
        '<td class="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap">' +
          escapeHtml(formatDate(msg.createdAt)) +
        '</td>' +
      '</tr>';
    }).join('');

    // These buttons previously had no listeners bound to them at all.
    var find = function(id) {
      return messages.find(function(m) { return Number(m.id) === Number(id); });
    };

    tbody.querySelectorAll('.view-message-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var msg = find(this.getAttribute('data-id'));
        if (msg) viewMessage(msg);
      });
    });

    tbody.querySelectorAll('.reply-message-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var msg = find(this.getAttribute('data-id'));
        if (msg) replyToMessage(msg);
      });
    });
  }

  function viewMessage(msg) {
    shared.openModal({
      title: msg.subject || '(no subject)',
      submitLabel: msg.isRead ? 'Close' : 'Mark as read',
      contentHtml:
        '<div class="space-y-3 text-sm">' +
          '<div><span class="font-bold">From:</span> ' + escapeHtml(msg.name) + ' &lt;' + escapeHtml(msg.email) + '&gt;</div>' +
          (msg.phone ? '<div><span class="font-bold">Phone:</span> ' + escapeHtml(msg.phone) + '</div>' : '') +
          '<div><span class="font-bold">Received:</span> ' + escapeHtml(formatDate(msg.createdAt)) + '</div>' +
          '<div class="pt-3 border-t border-outline-variant/20 whitespace-pre-wrap leading-relaxed">' +
            escapeHtml(msg.message || '') +
          '</div>' +
        '</div>',
      onSubmit: function(formData, close) {
        if (msg.isRead) { close(); return; }
        return api.put('/admin/contact/messages/' + msg.id + '/read', {}).then(function() {
          showToast('Marked as read', 'success');
          close();
          loadContactMessages(currentPage, currentSearch, currentUnreadOnly);
        }).catch(function(error) {
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
        '<div><label class="block text-xs font-bold text-primary mb-1" for="reply-subject">Subject</label>' +
          '<input id="reply-subject" name="subject" required minlength="3" maxlength="150" ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3 mb-4" ' +
            'value="' + escapeHtml('Re: ' + (msg.subject || 'your message')) + '"/></div>' +
        '<div><label class="block text-xs font-bold text-primary mb-1" for="reply-message">Message</label>' +
          '<textarea id="reply-message" name="message" required minlength="2" maxlength="10000" rows="7" ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3"></textarea></div>',
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

  function initInboxFilters() {
    var searchInput = document.getElementById('contact-search');
    if (searchInput) {
      var doSearch = shared.debounce(function(value) {
        loadContactMessages(1, value, currentUnreadOnly);
      }, 400);
      searchInput.addEventListener('input', function() { doSearch(this.value); });
    }

    var unreadToggle = document.getElementById('contact-unread-only');
    if (unreadToggle) {
      unreadToggle.addEventListener('change', function() {
        loadContactMessages(1, currentSearch, this.checked);
      });
    }
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.settings = {
    init: function() {
      if (!auth.requireAuth()) return;
      loadUserProfile();
      initProfileForm();
      initPasswordForm();
      initExternalLinksForm();
      loadExternalLinks();
      initInboxFilters();
      loadContactMessages(1);
    },
    loadUserProfile: loadUserProfile,
    loadContactMessages: loadContactMessages,
    loadExternalLinks: loadExternalLinks
  };

})();
