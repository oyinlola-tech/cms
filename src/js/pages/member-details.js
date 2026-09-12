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
      // The endpoint wraps the record: { member, givingYtd, ... }.
      renderMemberProfile(data.member || {}, data);
    }).catch(function(error) {
      console.error('Failed to load member:', error);
      showToast(error.message || 'Failed to load member', 'error');
    });
  }

  function renderMemberProfile(member, profile) {
    var setText = function(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    // The API returns first_name/last_name, not a combined `name`.
    var fullName = [member.first_name, member.last_name].filter(Boolean).join(' ');

    setText('member-name', fullName || member.name || 'Unknown member');
    setText('member-email', member.email || '\u2014');
    setText('member-phone', member.phone || '\u2014');
    setText('member-address', member.address || '\u2014');
    // The column is `dob`; `birthday` never existed on the record.
    setText('member-birthday', member.dob ? formatDate(member.dob) : '\u2014');
    setText('member-type', member.member_type || 'Member');
    setText('member-department', member.department || '\u2014');
    setText('member-joined', member.joined_date ? formatDate(member.joined_date) : '\u2014');

    if (profile) {
      setText('member-giving-ytd', formatCurrency(profile.givingYtd || 0));
      setText('member-attendance-rate', profile.attendanceRate === null || profile.attendanceRate === undefined
        ? '\u2014'
        : profile.attendanceRate + '%');
    }

    var avatarEl = document.getElementById('member-avatar');
    if (avatarEl) {
      avatarEl.src = member.avatar || '/images/default-avatar.svg';
      avatarEl.alt = fullName ? fullName + ' avatar' : 'Member avatar';
    }

    if (fullName) document.title = fullName + ' - Members';
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

    container.textContent = '';
    var strip = document.createElement('div');
    strip.className = 'flex gap-1 flex-wrap';

    attendance.forEach(function(a) {
      var present = a.present === true || a.status === 'present';
      var cell = document.createElement('div');
      cell.className = 'w-4 h-4 rounded-sm ' + (present ? 'bg-primary' : 'bg-surface-container-low');
      cell.title = formatDate(a.date) + ' - ' + (a.status || (present ? 'present' : 'absent'));
      strip.appendChild(cell);
    });

    container.appendChild(strip);
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