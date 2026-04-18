(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var showToast = shared ? shared.showToast : function() {};

  function hasUppercase(value) {
    return /[A-Z]/.test(value);
  }

  function hasDigit(value) {
    return /[0-9]/.test(value);
  }

  function hasSymbol(value) {
    return /[^A-Za-z0-9]/.test(value);
  }

  function updateStrengthIndicators(password) {
    var indicators = document.querySelectorAll('.strength-bar');
    indicators.forEach(function(bar, index) {
      bar.classList.remove('bg-error', 'bg-secondary', 'bg-primary');
    });

    var strength = 0;
    if (password.length >= 8) strength++;
    if (hasUppercase(password)) strength++;
    if (hasDigit(password)) strength++;
    if (hasSymbol(password)) strength++;

    var colors = ['bg-error', 'bg-error', 'bg-secondary', 'bg-primary'];
    indicators.forEach(function(bar, index) {
      if (index < strength) {
        bar.classList.add(colors[strength - 1]);
      }
    });
  }

  function initResetPassword() {
    var token = sessionStorage.getItem('resetToken');
    if (!token) {
      window.location.href = '/admin/forgot-password';
      return;
    }

    var form = document.getElementById('reset-password-form');
    if (!form) return;

    var passwordInput = form.querySelector('input[name="password"]');
    if (passwordInput) {
      passwordInput.addEventListener('input', function() {
        updateStrengthIndicators(this.value);
      });
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var password = form.querySelector('input[name="password"]').value;
      var confirmPassword = form.querySelector('input[name="confirm_password"]').value;

      if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }

      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resetting...';

      api.apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: token, newPassword: password })
      }).then(function() {
        sessionStorage.removeItem('resetToken');
        sessionStorage.removeItem('resetEmail');
        showToast('Password reset successful!', 'success');
        window.location.href = '/admin/login';
      }).catch(function(error) {
        showToast(error.message || 'Failed to reset password', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reset Password';
      });
    });

    var toggleBtns = document.querySelectorAll('.toggle-password');
    toggleBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.querySelector(this.getAttribute('data-target'));
        if (target) {
          if (target.type === 'password') {
            target.type = 'text';
          } else {
            target.type = 'password';
          }
        }
      });
    });
  }

  CMS.authPages = CMS.authPages || {};
  CMS.authPages.resetPassword = {
    init: initResetPassword
  };

})();