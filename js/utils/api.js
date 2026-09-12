(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};

  // The backend mounts the same routers at /api/v1 (canonical) and /api
  // (legacy). Target the versioned prefix so the versioning is real.
  var API_BASE_URL = window.API_BASE_URL || '/api/v1';

  function apiRequest(endpoint, options) {
    options = options || {};
    var parseAs = options.parseAs || 'json';
    var headers = options.headers ? Object.assign({}, options.headers) : {};

    var method = (options.method || 'GET').toUpperCase();
    var body = options.body;
    var isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData && method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    var authToken = localStorage.getItem('authToken');
    if (authToken) {
      headers['Authorization'] = 'Bearer ' + authToken;
    }

    return fetch(API_BASE_URL + endpoint, Object.assign({}, options, { headers: headers })).then(function(response) {
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        var path = window.location.pathname;
        if (path.indexOf('/admin') === 0 && path.indexOf('/admin/login') !== 0) {
          window.location.href = '/admin/login';
        }
        var unauthorized = new Error('Your session has expired. Please sign in again.');
        unauthorized.status = 401;
        throw unauthorized;
      }

      var contentType = response.headers.get('content-type') || '';
      var shouldParseJson = parseAs === 'json' && contentType.indexOf('application/json') !== -1;

      var data;
      if (parseAs === 'blob') {
        data = response.blob();
      } else if (parseAs === 'text') {
        data = response.text();
      } else if (shouldParseJson) {
        data = response.json();
      } else {
        data = response.text();
      }

      return data.then(function(data) {
        if (!response.ok) {
          var message = typeof data === 'object' && data && data.message
            ? data.message
            : (typeof data === 'string' && data ? data : 'Request failed');
          var error = new Error(message);
          error.status = response.status;
          error.body = data;
          throw error;
        }
        return data;
      });
    }).catch(function(error) {
      if (!error.status) {
        // Network-level failure rather than an HTTP error response.
        error.message = 'Network error. Check your connection and try again.';
      }
      console.error('API Error:', error.message);
      throw error;
    });
  }

  function withBody(method) {
    return function(endpoint, body) {
      var isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      return apiRequest(endpoint, {
        method: method,
        body: isFormData || typeof body === 'string' ? body : JSON.stringify(body || {})
      });
    };
  }

  CMS.api = {
    apiRequest: apiRequest,
    get: function(endpoint) {
      return apiRequest(endpoint, { method: 'GET' });
    },
    post: withBody('POST'),
    put: withBody('PUT'),
    delete: function(endpoint) {
      return apiRequest(endpoint, { method: 'DELETE' });
    }
  };

})();