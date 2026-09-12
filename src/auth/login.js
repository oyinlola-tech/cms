(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var auth = CMS.auth;
  var showToast = shared ? shared.showToast : function() {};

  function initLogin() {
    var form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var formData = new FormData(form);
      var email = formData.get('email');
      var password = formData.get('password');

      var restore = shared.setButtonBusy(form.querySelector('button[type="submit"]'), 'Signing in\u2026');

      auth.login(email, password).then(function() {
        window.location.href = '/admin/dashboard';
      }).catch(function(error) {
        showToast(error.message || 'Those details did not match an account.', 'error');
        restore();
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'Enter') {
        form.dispatchEvent(new Event('submit'));
      }
    });
  }

  CMS.authPages = CMS.authPages || {};
  CMS.authPages.login = {
    init: initLogin
  };

})();