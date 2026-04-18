(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var showToast = shared ? shared.showToast : function() {};

  var countdown = 120;
  var timerInterval;

  function startCountdown() {
    var display = document.getElementById('countdown-display');
    var resendBtn = document.getElementById('resend-otp-btn');
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
    var emailDisplay = document.getElementById('masked-email');
    if (emailDisplay) emailDisplay.textContent = maskedEmail;

    startCountdown();

    var form = document.getElementById('verify-otp-form');
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

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      api.apiRequest('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email, otp: otp })
      }).then(function(data) {
        sessionStorage.setItem('resetToken', data.token);
        showToast('OTP verified!', 'success');
        window.location.href = '/admin/reset-password';
      }).catch(function(error) {
        showToast(error.message || 'Invalid OTP', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify OTP';
      });
    });

    var resendBtn = document.getElementById('resend-otp-btn');
    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.addEventListener('click', function() {
        api.apiRequest('/auth/resend-otp', {
          method: 'POST',
          body: JSON.stringify({ email: email })
        }).then(function() {
          showToast('OTP resent!', 'success');
          startCountdown();
        }).catch(function(error) {
          showToast(error.message || 'Failed to resend OTP', 'error');
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