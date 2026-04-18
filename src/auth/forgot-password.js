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

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      api.apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email })
      }).then(function() {
        sessionStorage.setItem('resetEmail', email);
        showToast('OTP sent to your email!', 'success');
        window.location.href = '/admin/verify-otp';
      }).catch(function(error) {
        showToast(error.message || 'Failed to send OTP', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
      });
    });
  }

  CMS.authPages = CMS.authPages || {};
  CMS.authPages.forgotPassword = {
    init: initForgotPassword
  };

})();