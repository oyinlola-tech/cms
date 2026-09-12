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

  function escapeHtml(value) {
    return CMS.shared && CMS.shared.escapeHtml
      ? CMS.shared.escapeHtml(value)
      : String(value == null ? '' : value);
  }

  function renderWeek(list, rows) {
    var now = new Date();
    var resolved = CMS.schedule.resolveWeek(rows, now);
    var entries = resolved.entries;
    var soonest = resolved.next;

    if (entries.length === 0) return;

    list.innerHTML = entries.map(function (entry) {
      var isNext = soonest && entry === soonest;
      var time = CMS.schedule.splitTime(entry.start);

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
                escapeHtml(CMS.schedule.relativeLabel(entry.next, now)) +
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
    if (!list || !CMS.api || !CMS.schedule) return Promise.resolve();

    return CMS.schedule.loadWeek().then(function (rows) {
      if (rows.length > 0) renderWeek(list, rows);
    });
  }

  CMS.footer = { init: initFooterWeek, renderWeek: renderWeek };
})();
