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

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      auth.login(email, password).then(function() {
        showToast('Login successful!', 'success');
        window.location.href = '/admin';
      }).catch(function(error) {
        showToast(error.message || 'Login failed. Please check your credentials.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
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