(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };

  function getAnnouncementId() {
    var path = window.location.pathname;
    var match = path.match(/\/announcements\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  function fetchAnnouncement(id) {
    return api.apiRequest('/announcements/' + id).then(function(data) {
      renderAnnouncement(data);
    }).catch(function(error) {
      console.error('Failed to load announcement:', error);
    });
  }

  function renderAnnouncement(ann) {
    var titleEl = document.getElementById('announcement-title');
    var contentEl = document.getElementById('announcement-content');
    var metaEl = document.getElementById('announcement-meta');
    var imageEl = document.getElementById('announcement-image');

    if (titleEl) titleEl.textContent = ann.title || '';
    if (contentEl) contentEl.innerHTML = ann.content || '';
    if (metaEl) metaEl.textContent = formatDate(ann.created_at) + (ann.category ? ' • ' + ann.category : '');
    if (imageEl && ann.image_url) imageEl.src = ann.image_url;
  }

  function initAnnouncementDetails(id) {
    id = id || getAnnouncementId();
    if (!id) return;
    fetchAnnouncement(id);
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.announcementDetails = {
    init: function() {
      shared.init();
      initAnnouncementDetails();
    },
    fetchAnnouncement: fetchAnnouncement
  };

})();