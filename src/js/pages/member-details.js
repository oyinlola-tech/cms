(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };
  var formatCurrency = shared ? shared.formatCurrency : function(a) { return a; };
  var showToast = shared ? shared.showToast : function() {};

  function getMemberId() {
    var path = window.location.pathname;
    var match = path.match(/\/admin\/members\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  function loadMemberProfile(id) {
    return api.apiRequest('/members/' + id + '/profile').then(function(data) {
      renderMemberProfile(data);
    }).catch(function(error) {
      console.error('Failed to load member:', error);
    });
  }

  function renderMemberProfile(member) {
    var nameEl = document.getElementById('member-name');
    var emailEl = document.getElementById('member-email');
    var phoneEl = document.getElementById('member-phone');
    var addressEl = document.getElementById('member-address');
    var birthdayEl = document.getElementById('member-birthday');
    var memberTypeEl = document.getElementById('member-type');

    if (nameEl) nameEl.textContent = member.name || '';
    if (emailEl) emailEl.textContent = member.email || '—';
    if (phoneEl) phoneEl.textContent = member.phone || '—';
    if (addressEl) addressEl.textContent = member.address || '—';
    if (birthdayEl) birthdayEl.textContent = member.birthday ? formatDate(member.birthday) : '—';
    if (memberTypeEl) memberTypeEl.textContent = member.member_type || 'Member';
  }

  function loadMemberTransactions(id) {
    return api.apiRequest('/members/' + id + '/transactions').then(function(data) {
      renderMemberTransactions(data.items || []);
    }).catch(function(error) {
      console.error('Failed to load transactions:', error);
    });
  }

  function renderMemberTransactions(transactions) {
    var tbody = document.querySelector('#transactions-table tbody');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-on-surface-variant">No transactions</td></tr>';
      return;
    }

    var html = '';
    transactions.forEach(function(tx) {
      html += '<tr>' +
        '<td>' + formatDate(tx.date) + '</td>' +
        '<td>' + escapeHtml(tx.category || tx.type) + '</td>' +
        '<td>' + escapeHtml(tx.description || '—') + '</td>' +
        '<td class="font-bold ' + (tx.type === 'income' ? 'text-primary' : 'text-error') + '">' +
          (tx.type === 'expense' ? '-' : '') + formatCurrency(tx.amount) +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }

  function loadMemberAttendance(id) {
    return api.apiRequest('/members/' + id + '/attendance').then(function(data) {
      renderMemberAttendance(data.items || []);
    }).catch(function(error) {
      console.error('Failed to load attendance:', error);
    });
  }

  function renderMemberAttendance(attendance) {
    var container = document.getElementById('attendance-chart');
    if (!container) return;

    if (!attendance || attendance.length === 0) {
      container.innerHTML = '<p class="text-on-surface-variant text-sm">No attendance records</p>';
      return;
    }

    container.innerHTML = '<div class="flex gap-1">' +
      attendance.map(function(a) {
        return '<div class="w-4 h-4 rounded-sm ' + (a.present ? 'bg-primary' : 'bg-surface-container-low') + '" title="' + formatDate(a.date) + '"></div>';
      }).join('') +
    '</div>';
  }

  function initMemberDetails(id) {
    id = id || getMemberId();
    if (!id) return;
    if (!auth.requireAuth()) return;

    loadMemberProfile(id);
    loadMemberTransactions(id);
    loadMemberAttendance(id);
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.memberDetails = {
    init: initMemberDetails,
    loadMemberProfile: loadMemberProfile
  };

})();