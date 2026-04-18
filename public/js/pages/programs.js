(function() {
  'use strict';

  var CMS = window.CMS = window.CMS || {};
  var shared = CMS.shared;
  var api = CMS.api;
  var escapeHtml = shared ? shared.escapeHtml : function(v) { return String(v || ''); };
  var formatTime = shared ? shared.formatTime : function(d) { return d; };
  var formatDate = shared ? shared.formatDate : function(d) { return d; };

  function fetchUpcomingPrograms() {
    return api.apiRequest('/programs?status=upcoming').then(function(data) {
      renderUpcomingPrograms(data);
    }).catch(function(error) {
      console.error('Failed to load upcoming programs:', error);
    });
  }

  function renderUpcomingPrograms(programs) {
    var container = document.getElementById('upcoming-programs-container');
    if (!container) return;
    if (!programs || programs.length === 0) {
      container.innerHTML = '<p class="text-center py-8 text-on-surface-variant">No upcoming programs scheduled.</p>';
      return;
    }

    var html = '';
    programs.slice(0, 5).forEach(function(prog) {
      var isHighlighted = prog.is_main_service;
      var startDate = prog.start_datetime || prog.startDatetime || prog.date;
      var date = new Date(startDate);
      var month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      var day = date.getDate();
      var schedule = prog.schedule || formatTime(startDate);

      html += '<div class="group ' + (isHighlighted ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest') + ' p-8 rounded-xl flex flex-col md:flex-row gap-8 transition-all hover:shadow-xl ' + (isHighlighted ? 'relative overflow-hidden' : '') + '">' +
        (isHighlighted ? '<div class="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4"><span class="material-symbols-outlined text-[10rem]">nightlight</span></div>' : '') +
        '<div class="flex-shrink-0 flex flex-col items-center justify-center ' + (isHighlighted ? 'bg-secondary text-on-secondary' : 'bg-secondary-container text-on-secondary-container') + ' rounded-2xl w-24 h-24 ' + (isHighlighted ? 'z-10' : '') + '">' +
          '<span class="text-sm font-bold">' + month + '</span>' +
          '<span class="text-3xl font-black">' + day + '</span>' +
        '</div>' +
        '<div class="flex-1 ' + (isHighlighted ? 'z-10' : '') + '">' +
          '<div class="flex flex-wrap items-center gap-3 mb-2">' +
            '<span class="' + (isHighlighted ? 'bg-on-primary/20 text-white' : 'bg-primary-container text-on-primary-container') + ' text-xs font-bold px-3 py-1 rounded-full">' + escapeHtml(prog.type) + '</span>' +
            '<span class="' + (isHighlighted ? 'text-on-primary/70' : 'text-on-surface-variant') + ' text-sm flex items-center gap-1">' +
              '<span class="material-symbols-outlined text-sm">schedule</span> ' + escapeHtml(schedule || '—') +
            '</span>' +
          '</div>' +
          '<h3 class="text-2xl font-bold ' + (isHighlighted ? '' : 'text-primary') + ' mb-3">' + escapeHtml(prog.title) + '</h3>' +
          '<p class="' + (isHighlighted ? 'text-on-primary/80' : 'text-on-surface-variant') + ' leading-relaxed">' + escapeHtml(prog.description) + '</p>' +
        '</div>' +
        '<div class="flex items-center ' + (isHighlighted ? 'z-10' : '') + '">' +
          '<button class="' + (isHighlighted ? 'bg-secondary text-on-secondary px-6 py-3 rounded-xl font-bold hover:scale-105' : 'text-primary font-bold hover:underline') + ' transition-transform">Details</button>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = html;
  }

  function fetchPastPrograms() {
    return api.apiRequest('/programs?status=past&limit=4').then(function(data) {
      renderPastPrograms(data);
    }).catch(function(error) {
      console.error('Failed to load past programs:', error);
    });
  }

  function renderPastPrograms(programs) {
    var container = document.getElementById('past-highlights-container');
    if (!container) return;
    if (!programs || programs.length === 0) {
      container.innerHTML = '<p class="col-span-2 text-on-surface-variant">No past highlights.</p>';
      return;
    }

    var html = '';
    programs.forEach(function(prog) {
      var desc = typeof prog.description === 'string' ? prog.description : '';
      var shortDesc = desc.substring(0, 80);
      html += '<div class="bg-surface-container-low p-6 rounded-xl group hover:bg-surface-container-high transition-colors">' +
        '<div class="text-on-surface-variant text-xs font-bold mb-2">' + formatDate(prog.start_datetime || prog.startDatetime || prog.date).toUpperCase() + '</div>' +
        '<h4 class="text-xl font-bold text-primary mb-2">' + escapeHtml(prog.title) + '</h4>' +
        '<p class="text-on-surface-variant text-sm mb-4">' + escapeHtml(shortDesc) + (desc.length > 80 ? '...' : '') + '</p>' +
        '<a href="/programs" class="text-secondary font-bold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">' +
          'Watch Replay <span class="material-symbols-outlined text-sm">arrow_forward</span>' +
        '</a>' +
      '</div>';
    });
    container.innerHTML = html;
  }

  function fetchWeeklySchedule() {
    return api.apiRequest('/programs/weekly-schedule').then(function(data) {
      renderWeeklySchedule(data);
    }).catch(function(error) {
      console.error('Failed to load weekly schedule:', error);
    });
  }

  function renderWeeklySchedule(schedule) {
    var container = document.getElementById('weekly-schedule-container');
    if (!container || !schedule) return;

    var html = '';
    schedule.forEach(function(item) {
      var start = item.start_time || item.startTime || '';
      var end = item.end_time || item.endTime || '';
      var time = end ? start + ' - ' + end : start;
      html += '<li class="flex justify-between items-start">' +
        '<div>' +
          '<span class="font-bold text-primary block">' + escapeHtml(item.day_of_week || item.day || '') + '</span>' +
          '<span class="text-sm text-on-surface-variant italic">' + escapeHtml(item.program_name || item.name || '') + '</span>' +
        '</div>' +
        '<span class="text-sm font-bold text-secondary">' + escapeHtml(time || '—') + '</span>' +
      '</li>';
    });
    container.innerHTML = html;
  }

  CMS.pages = CMS.pages || {};
  CMS.pages.programs = {
    init: function() {
      shared.init();
      Promise.all([
        fetchUpcomingPrograms(),
        fetchPastPrograms(),
        fetchWeeklySchedule()
      ]);
    },
    fetchUpcomingPrograms: fetchUpcomingPrograms,
    renderUpcomingPrograms: renderUpcomingPrograms,
    fetchPastPrograms: fetchPastPrograms,
    renderPastPrograms: renderPastPrograms,
    fetchWeeklySchedule: fetchWeeklySchedule,
    renderWeeklySchedule: renderWeeklySchedule
  };

})();