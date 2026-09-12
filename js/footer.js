/**
 * Footer: the weekly service rail.
 *
 * The parish already publishes its weekly schedule at
 * GET /api/v1/programs/weekly-schedule, but nothing outside the Programs page
 * used it. The footer is where someone decides whether to come on Sunday, so
 * it opens with the week and marks the next service.
 *
 * The markup ships with the schedule already rendered, so the footer is correct
 * without JavaScript. This module refreshes it from the API and adds the "next"
 * marker, which is the part that cannot be baked into static HTML.
 */
(function () {
  'use strict';

  var CMS = window.CMS = window.CMS || {};

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function escapeHtml(value) {
    return CMS.shared && CMS.shared.escapeHtml
      ? CMS.shared.escapeHtml(value)
      : String(value == null ? '' : value);
  }

  /**
   * The next time a weekly slot comes round, from `now`.
   * @returns {Date|null}
   */
  function nextOccurrence(dayName, startTime, now) {
    var dayIndex = DAYS.indexOf(String(dayName));
    if (dayIndex < 0) return null;

    var parts = String(startTime || '').split(':');
    var hours = Number(parts[0]);
    var minutes = Number(parts[1] || 0);
    if (!isFinite(hours) || !isFinite(minutes)) return null;

    var next = new Date(now.getTime());
    next.setDate(next.getDate() + ((dayIndex - next.getDay() + 7) % 7));
    next.setHours(hours, minutes, 0, 0);

    // Already gone today, so it falls next week.
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }

  function splitTime(startTime) {
    var parts = String(startTime || '').split(':');
    var hours = Number(parts[0]);
    var minutes = Number(parts[1] || 0);
    if (!isFinite(hours)) return { clock: '--:--', meridiem: '' };

    var meridiem = hours >= 12 ? 'PM' : 'AM';
    var clock = ((hours % 12) || 12) + ':' + String(minutes).padStart(2, '0');
    return { clock: clock, meridiem: meridiem };
  }

  /** "Today", "Tomorrow", or "In 4 days" - whichever is true. */
  function relativeLabel(date, now) {
    var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var days = Math.round((startOfTarget - startOfToday) / 86400000);

    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return 'In ' + days + ' days';
  }

  function renderWeek(list, rows) {
    var now = new Date();

    var entries = rows.map(function (row) {
      return {
        day: row.day_of_week,
        name: row.program_name,
        start: row.start_time,
        next: nextOccurrence(row.day_of_week, row.start_time, now)
      };
    }).filter(function (entry) {
      return entry.day && entry.name;
    });

    if (entries.length === 0) return;

    var soonest = entries.reduce(function (best, entry) {
      if (!entry.next) return best;
      if (!best || !best.next) return entry;
      return entry.next < best.next ? entry : best;
    }, null);

    list.innerHTML = entries.map(function (entry) {
      var isNext = soonest && entry === soonest;
      var time = splitTime(entry.start);

      return '<li class="footer-week-slot relative py-6 sm:py-0 sm:px-6 first:sm:pl-0 last:sm:pr-0' +
          (isNext ? ' is-next' : '') + '">' +
        (isNext
          ? '<span class="absolute left-0 top-6 bottom-6 w-px bg-secondary-container sm:left-0"></span>'
          : '') +
        // The relative label sits beside the day name, not pushed to the far
        // edge of the cell where it reads as a separate column.
        '<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">' +
          '<p class="font-body text-[10px] font-black uppercase tracking-[0.22em] ' +
            (isNext ? 'text-secondary-container' : 'text-on-primary/40') + '">' +
            escapeHtml(entry.day) +
          '</p>' +
          (isNext && entry.next
            ? '<p class="rounded-full bg-secondary-container/15 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-secondary-container">' +
                escapeHtml(relativeLabel(entry.next, now)) +
              '</p>'
            : '') +
        '</div>' +
        '<p class="mt-3 font-headline font-black leading-none tracking-tight ' +
          (isNext ? 'text-secondary-container' : 'text-on-primary') + '">' +
          '<span class="text-[2rem] sm:text-[2.25rem] tabular-nums">' + escapeHtml(time.clock) + '</span>' +
          '<span class="ml-1.5 font-body text-xs font-extrabold tracking-[0.1em] align-top">' +
            escapeHtml(time.meridiem) +
          '</span>' +
        '</p>' +
        '<p class="mt-2 font-body text-sm ' + (isNext ? 'text-on-primary' : 'text-on-primary/55') + '">' +
          escapeHtml(entry.name) +
        '</p>' +
      '</li>';
    }).join('');
  }

  function initFooterWeek() {
    var list = document.getElementById('footer-week');
    if (!list || !CMS.api) return Promise.resolve();

    return CMS.api.apiRequest('/programs/weekly-schedule').then(function (rows) {
      if (Array.isArray(rows) && rows.length > 0) renderWeek(list, rows);
    }).catch(function () {
      // The static markup already shows the schedule; leave it in place.
    });
  }

  CMS.footer = { init: initFooterWeek, nextOccurrence: nextOccurrence, splitTime: splitTime, relativeLabel: relativeLabel };
})();
