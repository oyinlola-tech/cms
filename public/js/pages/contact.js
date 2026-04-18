(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var showToast = shared ? shared.showToast : function() {};
  var debounce = shared ? shared.debounce : function(fn) { return fn; };

  function loadChurchInfo() {
    return api.apiRequest('/contact/info').then(function(data) {
      renderChurchInfo(data);
    }).catch(function(error) {
      console.error('Failed to load contact info:', error);
    });
  }

  function renderChurchInfo(info) {
    var phoneEl = document.getElementById('church-phone');
    var emailEl = document.getElementById('church-email');
    var addressEl = document.getElementById('church-address');
    if (phoneEl && info.phone) phoneEl.textContent = info.phone;
    if (emailEl && info.email) emailEl.textContent = info.email;
    if (addressEl && info.address) addressEl.textContent = info.address;
  }

  function initContactForm() {
    var form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var formData = new FormData(form);
      var data = {
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message')
      };

      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      api.apiRequest('/contact/send', {
        method: 'POST',
        body: JSON.stringify(data)
      }).then(function(response) {
        showToast('Message sent successfully! We\'ll get back to you soon.', 'success');
        form.reset();
      }).catch(function(error) {
        showToast(error.message || 'Failed to send message. Please try again.', 'error');
      }).finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'Enter') {
        form.dispatchEvent(new Event('submit'));
      }
    });
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.contact = {
    init: function() {
      shared.init();
      loadChurchInfo();
      initContactForm();
    },
    loadChurchInfo: loadChurchInfo,
    renderChurchInfo: renderChurchInfo
  };

})();