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
      if (data.totalPages > 1) {
        renderPaginationControls(
          document.getElementById('pagination-controls'),
          data.page,
          data.totalPages,
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

  function transactionFormHtml() {
    var select = function(name, label, options, value) {
      return '<div>' +
        '<label class="block text-xs font-bold text-primary mb-1" for="t-' + name + '">' + label + '</label>' +
        '<select id="t-' + name + '" name="' + name + '" class="w-full bg-surface-container-highest rounded-lg px-4 py-3">' +
          options.map(function(opt) {
            return '<option value="' + opt + '"' + (opt === value ? ' selected' : '') + '>' + opt + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    };

    var today = new Date().toISOString().slice(0, 10);

    return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        select('type', 'Type', ['income', 'expense'], 'income') +
        '<div>' +
          '<label class="block text-xs font-bold text-primary mb-1" for="t-category">Category</label>' +
          '<input id="t-category" name="category" required minlength="2" maxlength="50" ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3" placeholder="Tithe, Offering, Utilities..."/>' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-bold text-primary mb-1" for="t-amount">Amount (NGN)</label>' +
          '<input id="t-amount" name="amount" type="number" step="0.01" min="0.01" required ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3"/>' +
        '</div>' +
        '<div>' +
          '<label class="block text-xs font-bold text-primary mb-1" for="t-date">Date</label>' +
          '<input id="t-date" name="transaction_date" type="date" required value="' + today + '" ' +
            'class="w-full bg-surface-container-highest rounded-lg px-4 py-3"/>' +
        '</div>' +
        select('payment_method', 'Payment method', ['cash', 'bank_transfer', 'mobile', 'card', 'other'], 'cash') +
        select('status', 'Status', ['completed', 'pending', 'cancelled'], 'completed') +
      '</div>' +
      '<div class="mt-4">' +
        '<label class="block text-xs font-bold text-primary mb-1" for="t-description">Description</label>' +
        '<textarea id="t-description" name="description" rows="2" maxlength="2000" ' +
          'class="w-full bg-surface-container-highest rounded-lg px-4 py-3"></textarea>' +
      '</div>';
  }

  /** "Add transaction" existed in the HTML but had no handler. */
  function openCreateTransaction() {
    shared.openModal({
      title: 'Record transaction',
      submitLabel: 'Save transaction',
      contentHtml: transactionFormHtml(),
      onSubmit: function(formData, close) {
        var amount = Number(formData.get('amount'));
        if (!isFinite(amount) || amount <= 0) {
          showToast('Enter an amount greater than zero', 'error');
          return;
        }

        return api.post('/finance/transactions', {
          type: formData.get('type'),
          category: String(formData.get('category') || '').trim(),
          amount: amount,
          description: formData.get('description') || null,
          payment_method: formData.get('payment_method'),
          status: formData.get('status'),
          transaction_date: formData.get('transaction_date')
        }).then(function() {
          showToast('Transaction recorded', 'success');
          close();
          loadTransactions(1);
          loadFinanceData();
        }).catch(function(error) {
          showToast(error.message || 'Failed to record transaction', 'error');
        });
      }
    });
  }

  function initCreateButtons() {
    ['add-transaction-btn', 'new-transaction-btn', 'new-record-btn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openCreateTransaction);
    });

    var exportBtn = document.getElementById('export-transactions-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        exportTransactions();
      });
    }
  }

  /**
   * Downloads the CSV export. A plain link cannot be used because the endpoint
   * requires the Authorization header.
   */
  function exportTransactions() {
    return api.apiRequest('/finance/export', { parseAs: 'blob' }).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'transactions.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }).catch(function(error) {
      showToast(error.message || 'Failed to export transactions', 'error');
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.finance = {
    init: function() {
      if (!auth.requireAuth()) return;
      initCreateButtons();
      loadFinanceData();
      initSearch();
    },
    loadFinanceData: loadFinanceData,
    loadTransactions: loadTransactions
  };

})();