(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};

  function login(email, password) {
    return CMS.api.apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function(data) {
      var authToken = data.token;
      var currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      return data;
    });
  }

  function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/admin/login';
  }

  function getAuthToken() {
    return localStorage.getItem('authToken');
  }

  function getCurrentUser() {
    var userStr = localStorage.getItem('currentUser');
    if (!userStr || userStr === 'null') return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }

  function requireAuth() {
    var token = getAuthToken();
    if (!token && window.location.pathname.indexOf('/login') === -1) {
      window.location.href = '/admin/login';
      return false;
    }
    return true;
  }

  function isAuthenticated() {
    return !!getAuthToken();
  }

  CMS.auth = {
    login: login,
    logout: logout,
    getAuthToken: getAuthToken,
    getCurrentUser: getCurrentUser,
    requireAuth: requireAuth,
    isAuthenticated: isAuthenticated
  };

})();