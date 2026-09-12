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
      var contentEl = document.getElementById('announcement-content');
      var titleEl = document.getElementById('announcement-title');
      if (titleEl) {
        titleEl.textContent = error.status === 404 ? 'Announcement not found' : 'Unable to load announcement';
      }
      if (contentEl) {
        contentEl.textContent = error.status === 404
          ? 'This announcement may have been removed or is not yet published.'
          : error.message;
      }
    });
  }

  /**
   * Renders announcement body text as paragraphs.
   *
   * This used to be `contentEl.innerHTML = ann.content`, which executed any
   * markup an editor had stored - a stored-XSS vector on a public page.
   * Content is stored as plain text now, and is rendered through text nodes so
   * it stays inert even if a legacy row still contains markup.
   */
  function renderContent(container, text) {
    container.textContent = '';

    var paragraphs = String(text || '').split(/\n{2,}/);
    paragraphs.forEach(function(block) {
      if (!block.trim()) return;

      var p = document.createElement('p');
      p.className = 'mb-4 leading-relaxed';

      // Single newlines inside a block become <br>.
      block.split(/\n/).forEach(function(line, index) {
        if (index > 0) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });

      container.appendChild(p);
    });
  }

  function isSafeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    var trimmed = value.trim();
    // Relative asset paths, or an absolute http(s) URL. Anything else - most
    // importantly javascript: and data: - is rejected.
    if (/^\/(uploads|images)\//.test(trimmed) && trimmed.indexOf('..') === -1) return true;
    return /^https?:\/\//i.test(trimmed);
  }

  function renderAnnouncement(ann) {
    var titleEl = document.getElementById('announcement-title');
    var contentEl = document.getElementById('announcement-content');
    var metaEl = document.getElementById('announcement-meta');
    var imageEl = document.getElementById('announcement-image');

    if (titleEl) titleEl.textContent = ann.title || '';
    if (contentEl) renderContent(contentEl, ann.content || ann.summary || '');
    if (metaEl) metaEl.textContent = formatDate(ann.created_at) + (ann.category ? ' \u2022 ' + ann.category : '');

    if (imageEl) {
      if (isSafeImageUrl(ann.image_url)) {
        imageEl.src = ann.image_url;
        imageEl.alt = ann.title || 'Announcement image';
        imageEl.hidden = false;
      } else {
        imageEl.hidden = true;
      }
    }

    if (ann.title) {
      document.title = ann.title + ' - The Sacred Hearth';
    }
  }

  function initAnnouncementDetails(id) {
    id = id || getAnnouncementId();
    if (!id) return;
    fetchAnnouncement(id);
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.announcementDetails = {
    init: function() {
      initAnnouncementDetails();
    },
    fetchAnnouncement: fetchAnnouncement
  };

})();