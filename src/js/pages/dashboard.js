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
  var openModal = shared ? shared.openModal : function() {};

  function loadDashboardStats() {
    return api.apiRequest('/dashboard/stats').then(function(data) {
      document.getElementById('total-members').textContent = data.totalMembers.toLocaleString();
      document.getElementById('members-change').textContent = '+' + data.newMembersThisMonth;
      document.getElementById('monthly-donations').textContent = formatCurrency(data.monthlyDonations);
      document.getElementById('donations-change').textContent = '+' + data.donationsChange + '%';
    }).catch(function(error) {
      console.error('Failed to load dashboard stats:', error);
    });
  }

  function loadDonationChart() {
    return api.apiRequest('/dashboard/donation-trends').then(function(data) {
      var container = document.getElementById('donation-chart');
      if (!container) return;
    }).catch(function(error) {
      console.error('Failed to load donation chart:', error);
    });
  }

  function loadRecentActivity() {
    return api.apiRequest('/dashboard/recent-activity').then(function(data) {
      var container = document.getElementById('recent-activity');
      if (!container) return;
      if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-on-surface-variant text-sm">No recent activity</p>';
        return;
      }
      var html = '<div class="space-y-3">';
      data.forEach(function(item) {
        html += '<div class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-lowest">' +
          '<div class="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">' +
            '<span class="material-symbols-outlined text-primary">' + (item.type === 'member' ? 'person_add' : 'favorite') + '</span>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-sm font-semibold text-primary truncate">' + escapeHtml(item.description || item.title || '') + '</div>' +
            '<div class="text-xs text-on-surface-variant">' + formatDate(item.created_at || item.date) + '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      container.innerHTML = html;
    }).catch(function(error) {
      console.error('Failed to load recent activity:', error);
    });
  }

  function loadUpcomingEvent() {
    return api.apiRequest('/dashboard/upcoming-event').then(function(data) {
      var container = document.getElementById('upcoming-event');
      if (!container) return;
      if (!data) {
        container.innerHTML = '<p class="text-on-surface-variant">No upcoming events</p>';
        return;
      }
      container.innerHTML = '<div class="space-y-3">' +
        '<h4 class="font-bold text-primary">' + escapeHtml(data.title) + '</h4>' +
        '<p class="text-sm text-on-surface-variant">' + escapeHtml(data.description) + '</p>' +
        '<div class="text-xs font-semibold text-secondary">' + formatDate(data.start_datetime || data.date) + '</div>' +
      '</div>';
    }).catch(function(error) {
      console.error('Failed to load upcoming event:', error);
    });
  }

  function initDashboard() {
    if (!auth.requireAuth()) return;

    var currentUser = auth.getCurrentUser();
    if (currentUser) {
      var adminNameEl = document.getElementById('admin-name');
      var displayNameEl = document.getElementById('admin-display-name');
      if (adminNameEl) adminNameEl.textContent = currentUser.name;
      if (displayNameEl) displayNameEl.textContent = currentUser.name;
    }

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        auth.logout();
      });
    }

    Promise.all([
      loadDashboardStats(),
      loadDonationChart(),
      loadRecentActivity(),
      loadUpcomingEvent()
    ]);
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.dashboard = {
    init: initDashboard,
    loadDashboardStats: loadDashboardStats,
    loadDonationChart: loadDonationChart,
    loadRecentActivity: loadRecentActivity,
    loadUpcomingEvent: loadUpcomingEvent
  };

})();