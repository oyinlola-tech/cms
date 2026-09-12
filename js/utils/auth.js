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
    // Tell the server to revoke the token before dropping it locally, so the
    // JWT cannot be replayed for the remainder of its 7-day lifetime.
    var finish = function() {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.href = '/admin/login';
    };

    if (!getAuthToken()) {
      finish();
      return;
    }

    CMS.api.apiRequest('/auth/logout', { method: 'POST' })
      .catch(function() { /* revoke is best-effort; always clear locally */ })
      .then(finish, finish);
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

  /**
   * Reads the cached user's role. Used only to hide controls the user cannot
   * use - the server re-checks every permission on each request.
   */
  function getRole() {
    var user = getCurrentUser();
    return user && user.role ? user.role : null;
  }

  var ROLE_RANK = { viewer: 0, editor: 1, admin: 2, super_admin: 3 };

  function hasRole(minimumRole) {
    var role = getRole();
    if (!role) return false;
    return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimumRole] || 0);
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
    isAuthenticated: isAuthenticated,
    getRole: getRole,
    hasRole: hasRole
  };

})();