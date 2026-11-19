/**
 * EdVyro Careers - Database Idempotent Seed Script
 * Usage: npm run db:seed
 */

const { getDb, seedData, closeDb } = require('./database');

function main() {
  try {
    console.log('[DB:SEED] Seeding internships from data/internships.json...');
    const db = getDb();
    const count = seedData(db);
    console.log(`[DB:SEED] Successfully seeded/updated ${count} internships (INT-101 to INT-105).`);
    closeDb();
    process.exit(0);
  } catch (err) {
    console.error('[DB:SEED ERROR]', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
