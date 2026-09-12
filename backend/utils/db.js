/**
 * Executes a SQL query using either a connection pool or a single connection.
 * Works with both mysql2 connection pools and single connections.
 * @param {Object} db - The database connection or pool
 * @param {string} sql - The SQL query
 * @param {Array} params - The query parameters
 * @returns {Promise<Object>} - The query results
 */
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    // Handle both pool and connection objects
    const callback = (error, results) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(results);
    };

    // Check if this is a pool (has query method that accepts callback)
    if (typeof db.query === 'function') {
      db.query(sql, params, callback);
    } else {
      reject(new Error('Invalid database object'));
    }
  });
}

/**
 * Executes multiple queries in a transaction using a connection pool.
 * @param {Object} pool - The mysql2 connection pool
 * @param {Function} fn - Async function that receives a connection and executes queries
 * @returns {Promise<any>} - The result of the transaction function
 */
async function transaction(pool, fn) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      connection.beginTransaction(async (err) => {
        if (err) {
          connection.release();
          reject(err);
          return;
        }

        try {
          // Create a promisified query function for this connection
          const connQuery = (sql, params) => {
            return new Promise((res, rej) => {
              connection.query(sql, params, (error, results) => {
                if (error) rej(error);
                else res(results);
              });
            });
          };

          const result = await fn(connQuery, connection);
          
          connection.commit((err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
              });
              reject(err);
              return;
            }
            connection.release();
            resolve(result);
          });
        } catch (error) {
          connection.rollback(() => {
            connection.release();
          });
          reject(error);
        }
      });
    });
  });
}

module.exports = { query, transaction };
