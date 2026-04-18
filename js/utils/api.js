(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};

  var API_BASE_URL = window.API_BASE_URL || '/api';

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
        if (window.location.pathname.indexOf('/admin') !== -1 &&
            window.location.pathname.indexOf('/login') === -1) {
          window.location.href = '/admin/login';
        }
        throw new Error('Unauthorized');
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
          var message = typeof data === 'object' && data && data.message ? data.message : (typeof data === 'string' ? data : 'Request failed');
          if (CMS.shared && CMS.shared.showToast) {
            CMS.shared.showToast(message, 'error');
          }
          throw new Error(message);
        }
        return data;
      });
    }).catch(function(error) {
      console.error('API Error:', error);
      throw error;
    });
  }

  CMS.api = {
    apiRequest: apiRequest,
    get: function(endpoint) {
      return apiRequest(endpoint, { method: 'GET' });
    },
    post: function(endpoint, body) {
      return apiRequest(endpoint, { method: 'POST', body: body });
    },
    put: function(endpoint, body) {
      return apiRequest(endpoint, { method: 'PUT', body: body });
    },
    delete: function(endpoint) {
      return apiRequest(endpoint, { method: 'DELETE' });
    }
  };

})();