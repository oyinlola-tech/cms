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
  var debounce = shared ? shared.debounce : function(fn) { return fn; };
  var renderPaginationControls = shared ? shared.renderPaginationControls : function() {};

  var currentPage = 1;
  var currentSearch = '';

  function loadFinanceData() {
    return api.apiRequest('/finance/summary').then(function(data) {
      renderFinanceSummary(data);
    }).then(function() {
      return loadTransactions(1);
    }).catch(function(error) {
      console.error('Failed to load finance data:', error);
    });
  }

  function renderFinanceSummary(data) {
    var balanceEl = document.getElementById('finance-balance');
    var monthlyEl = document.getElementById('monthly-tithes');
    var expensesEl = document.getElementById('monthly-expenses');
    var trendEl = document.getElementById('donation-trend');

    if (balanceEl) balanceEl.textContent = formatCurrency(data.balance || 0);
    if (monthlyEl) monthlyEl.textContent = formatCurrency(data.monthlyTithes || 0);
    if (expensesEl) expensesEl.textContent = formatCurrency(data.monthlyExpenses || 0);
    if (trendEl) trendEl.textContent = (data.trend || 0) + '%';
  }

  function loadTransactions(page) {
    page = page || 1;
    return api.apiRequest('/finance/transactions?page=' + page).then(function(data) {
      renderTransactions(data.items || []);
      if (data.pagination) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.pagination.page,
          data.pagination.totalPages,
          function(newPage) {
            loadTransactions(newPage);
          }
        );
      }
    }).catch(function(error) {
      console.error('Failed to load transactions:', error);
    });
  }

  function renderTransactions(transactions) {
    var tbody = document.querySelector('#transactions-table tbody');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-on-surface-variant">No transactions found</td></tr>';
      return;
    }

    var html = '';
    transactions.forEach(function(tx) {
      html += '<tr>' +
        '<td>' + formatDate(tx.date) + '</td>' +
        '<td>' + escapeHtml(tx.category || tx.type || 'Transaction') + '</td>' +
        '<td>' + escapeHtml(tx.description || tx.reference || '—') + '</td>' +
        '<td class="' + (tx.type === 'income' ? 'text-primary' : 'text-error') + ' font-bold">' +
          (tx.type === 'expense' ? '-' : '') + formatCurrency(tx.amount) +
        '</td>' +
        '<td><span class="px-2 py-1 rounded text-xs font-bold bg-surface-container-low">' + escapeHtml(tx.status || 'Completed') + '</span></td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }

  function initSearch() {
    var searchInput = document.getElementById('finance-search');
    if (!searchInput) return;

    var doSearch = debounce(function(value) {
      currentSearch = value;
      currentPage = 1;
      loadTransactions(1);
    }, 500);

    searchInput.addEventListener('input', function() {
      doSearch(this.value);
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.finance = {
    init: function() {
      shared.init();
      if (!auth.requireAuth()) return;
      loadFinanceData();
      initSearch();
    },
    loadFinanceData: loadFinanceData,
    loadTransactions: loadTransactions
  };

})();