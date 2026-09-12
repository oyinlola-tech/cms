/**
 * Weekly schedule helpers.
 *
 * The parish week drives three places now - the announcement bar, the footer
 * rail, and the auth panel - so the date arithmetic lives here rather than
 * being duplicated in each.
 */
(function () {
  'use strict';

  var CMS = window.CMS = window.CMS || {};

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  /** Splits "17:00:00" into { clock: "5:00", meridiem: "PM" }. */
  function splitTime(startTime) {
    var parts = String(startTime || '').split(':');
    var hours = Number(parts[0]);
    var minutes = Number(parts[1] || 0);
    if (!isFinite(hours)) return { clock: '--:--', meridiem: '' };

    return {
      clock: ((hours % 12) || 12) + ':' + String(minutes).padStart(2, '0'),
      meridiem: hours >= 12 ? 'PM' : 'AM'
    };
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

  /**
   * Decorates rows with their next occurrence and flags the soonest.
   * @returns {{ entries: Array, next: Object|null }}
   */
  function resolveWeek(rows, now) {
    now = now || new Date();

    var entries = (rows || []).map(function (row) {
      return {
        day: row.day_of_week,
        name: row.program_name,
        start: row.start_time,
        next: nextOccurrence(row.day_of_week, row.start_time, now)
      };
    }).filter(function (entry) {
      return entry.day && entry.name;
    });

    var next = entries.reduce(function (best, entry) {
      if (!entry.next) return best;
      if (!best || !best.next) return entry;
      return entry.next < best.next ? entry : best;
    }, null);

    return { entries: entries, next: next };
  }

  /** Shared fetch, so the bar and the footer do not each hit the API. */
  var pending = null;
  function loadWeek() {
    if (pending) return pending;
    if (!CMS.api) return Promise.resolve([]);

    pending = CMS.api.apiRequest('/programs/weekly-schedule')
      .then(function (rows) { return Array.isArray(rows) ? rows : []; })
      .catch(function () { return []; });

    return pending;
  }

  CMS.schedule = {
    DAYS: DAYS,
    nextOccurrence: nextOccurrence,
    splitTime: splitTime,
    relativeLabel: relativeLabel,
    resolveWeek: resolveWeek,
    loadWeek: loadWeek
  };
})();
