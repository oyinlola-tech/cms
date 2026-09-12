const { query } = require('../utils/db');

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Promotes announcements whose scheduled_for time has passed.
 *
 * The schema has always had a 'scheduled' status, but nothing ever moved those
 * rows to 'published', so scheduled announcements stayed invisible forever.
 *
 * @param {Object} db - Database connection/pool
 * @returns {Promise<number>} - How many announcements were published
 */
async function publishDueAnnouncements(db) {
  const result = await query(
    db,
    `UPDATE announcements
        SET status = 'published', published_at = NOW(), scheduled_for = NULL
      WHERE status = 'scheduled'
        AND scheduled_for IS NOT NULL
        AND scheduled_for <= NOW()`
  );
  return Number(result?.affectedRows || 0);
}

/**
 * Starts the background scheduler.
 * @param {Object} options
 * @param {Object} options.db - Database connection/pool
 * @param {number} [options.intervalMs] - How often to check
 * @returns {{ stop: Function, runOnce: Function }}
 */
function startScheduler({ db, intervalMs = DEFAULT_INTERVAL_MS }) {
  let running = false;

  async function runOnce() {
    // Guard against overlapping runs if a tick outlives the interval.
    if (running) return 0;
    running = true;
    try {
      const published = await publishDueAnnouncements(db);
      if (published > 0) {
        console.log(`Scheduler: published ${published} scheduled announcement(s).`);
      }
      return published;
    } catch (error) {
      console.error('Scheduler run failed:', error.message);
      return 0;
    } finally {
      running = false;
    }
  }

  const timer = setInterval(runOnce, intervalMs);
  // Do not hold the process open purely for the scheduler.
  if (typeof timer.unref === 'function') timer.unref();

  runOnce();

  return {
    runOnce,
    stop() {
      clearInterval(timer);
    }
  };
}

module.exports = { publishDueAnnouncements, startScheduler, DEFAULT_INTERVAL_MS };
