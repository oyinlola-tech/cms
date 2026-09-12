(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var showToast = shared ? shared.showToast : function() {};

  var countdown = 120;
  var timerInterval;

  function startCountdown() {
    var display = document.getElementById('timer-display');
    var resendBtn = document.getElementById('resend-btn');
    if (!display) return;

    countdown = 120;
    display.textContent = '2:00';

    clearInterval(timerInterval);
    timerInterval = setInterval(function() {
      countdown--;
      var min = Math.floor(countdown / 60);
      var sec = countdown % 60;
      display.textContent = min + ':' + (sec < 10 ? '0' : '') + sec;

      if (countdown <= 0) {
        clearInterval(timerInterval);
        if (resendBtn) resendBtn.disabled = false;
      }
    }, 1000);
  }

  function initVerifyOTP() {
    var email = sessionStorage.getItem('resetEmail');
    if (!email) {
      window.location.href = '/admin/forgot-password';
      return;
    }

    var maskedEmail = email.replace(/(\w{1,3})\w+(@\w+)/, '$1***$2');
    var emailDisplay = document.getElementById('contact-mask');
    if (emailDisplay) emailDisplay.textContent = maskedEmail;

    startCountdown();

    var form = document.getElementById('otp-form');
    if (!form) return;

    var inputs = form.querySelectorAll('.otp-input');
    inputs.forEach(function(input, index) {
      input.addEventListener('input', function() {
        if (this.value.length === 1 && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      });

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && this.value === '' && index > 0) {
          inputs[index - 1].focus();
        }
      });
    });

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var otp = Array.from(inputs).map(function(i) { return i.value; }).join('');

      var restore = shared.setButtonBusy(form.querySelector('button[type="submit"]'), 'Verifying\u2026');

      api.apiRequest('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email, otp: otp })
      }).then(function(data) {
        sessionStorage.setItem('resetToken', data.token);
        window.location.href = '/admin/reset-password';
      }).catch(function(error) {
        showToast(error.message || 'That code is not valid or has expired.', 'error');
        restore();
      });
    });

    var resendBtn = document.getElementById('resend-btn');
    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.addEventListener('click', function() {
        api.apiRequest('/auth/resend-otp', {
          method: 'POST',
          body: JSON.stringify({ email: email })
        }).then(function() {
          showToast('A new code is on its way.', 'success');
          startCountdown();
        }).catch(function(error) {
          showToast(error.message || 'Could not send a new code. Try again.', 'error');
        });
      });
    }

    inputs[0].focus();
  }

  CMS.authPages = CMS.authPages || {};
  CMS.authPages.verifyOTP = {
    init: initVerifyOTP
  };

})();