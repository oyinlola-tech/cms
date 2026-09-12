(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var showToast = shared ? shared.showToast : function() {};

  function initForgotPassword() {
    var form = document.getElementById('forgot-password-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = form.querySelector('input[name="email"]').value;

      var restore = shared.setButtonBusy(form.querySelector('button[type="submit"]'), 'Sending\u2026');

      api.apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email })
      }).then(function() {
        sessionStorage.setItem('resetEmail', email);
        window.location.href = '/admin/verify-otp';
      }).catch(function(error) {
        showToast(error.message || 'Could not send the code. Try again.', 'error');
        restore();
      });
    });
  }

  CMS.authPages = CMS.authPages || {};
  CMS.authPages.forgotPassword = {
    init: initForgotPassword
  };

})();