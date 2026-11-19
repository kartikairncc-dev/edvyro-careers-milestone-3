/**
 * EdVyro Careers - Database Schema Initialization Script
 * Usage: npm run db:init
 */

const { getDb, initSchema, closeDb } = require('./database');

function main() {
  try {
    console.log('[DB:INIT] Initializing SQLite database schema from db/internship-board-sample.sql...');
    const db = getDb();
    initSchema(db);
    console.log('[DB:INIT] Schema initialized successfully with base tables and extended columns.');
    closeDb();
    process.exit(0);
  } catch (err) {
    console.error('[DB:INIT ERROR]', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
