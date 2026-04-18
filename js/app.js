/**
 * CMS JavaScript - Legacy Fallback Layer
 * 
 * This file now serves as a compatibility layer.
 * All functionality has been migrated to modular JS files:
 * - js/utils/shared.js, api.js, auth.js
 * - public/js/pages/*.js
 * - src/js/pages/*.js
 * - src/auth/*.js
 * 
 * This file only runs if new modules fail to load.
 * HTML files now load new modules directly.
 */

(function() {
  'use strict';

  // Check if new modules loaded
  if (window.CMS && window.CMS.shared && window.CMS.api) {
    console.log('Using new modular JS');
    return;
  }

  // Minimal fallback - redirect to prevent errors
  console.warn('New modules not found. Loading legacy mode...');
  
  var API_BASE = window.API_BASE_URL || '/api';
  var authToken = localStorage.getItem('authToken') || null;
  
  // Fallback apiRequest
  function apiRequest(endpoint, options) {
    options = options || {};
    var headers = options.headers ? Object.assign({}, options.headers) : {};
    var method = (options.method || 'GET').toUpperCase();
    var body = options.body;
    
    if (method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
      headers['Authorization'] = 'Bearer ' + authToken;
    }
    
    return fetch(API_BASE + endpoint, Object.assign({}, options, { headers: headers })).then(function(response) {
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        if (window.location.pathname.indexOf('/admin') !== -1) {
          window.location.href = '/admin/login';
        }
        throw new Error('Unauthorized');
      }
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') !== -1) {
        return response.json();
      }
      return response.text();
    });
  }
  
  // Fallback showToast
  function showToast(message, type, duration) {
    var toast = document.createElement('div');
    var bg = type === 'success' ? 'bg-green-700' : type === 'error' ? 'bg-error' : 'bg-primary';
    toast.className = 'fixed bottom-4 right-4 z-50 px-5 py-4 rounded-2xl shadow-2xl text-white ' + bg;
    toast.textContent = message || 'Notification';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, duration || 3000);
  }
  
  // Fallback escapeHtml
  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  
  // Fallback formatDate
  function formatDate(dateString, options) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
  }
  
  // Expose minimal API for fallback
  window.CMS = window.CMS || {};
  window.CMS.shared = {
    showToast: showToast,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    init: function() {}
  };
  window.CMS.api = { apiRequest: apiRequest };
  window.CMS.auth = {
    logout: function() {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.href = '/admin/login';
    }
  };
  
  console.log('Legacy fallback loaded');
})();