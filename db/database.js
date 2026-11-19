/**
 * EdVyro Careers - Database Connection and Migration Manager
 * SQLite via better-sqlite3 with parameterization and schema extensions.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

// Determine database path from environment variable or default to data/internships.db
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'internships.db');
const SAMPLE_SQL_PATH = path.join(__dirname, 'internship-board-sample.sql');
const SEED_JSON_PATH = path.join(__dirname, '..', 'data', 'internships.json');

let dbInstance = null;

/**
 * Get or initialize the SQLite database connection
 * @param {string} [customPath] - Optional override path (useful for isolated tests)
 * @returns {Database.Database}
 */
function getDb(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.DB_PATH || DEFAULT_DB_PATH;

  // Ensure directory exists if path is not memory
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Enable WAL mode for high concurrency & enable foreign key constraints
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  if (!customPath) {
    dbInstance = db;
  }

  return db;
}

/**
 * Initializes the schema:
 * 1. Executes db/internship-board-sample.sql as the base schema.
 * 2. Applies extensions (location, skills, openings, stipend, duration, description to internships;
 *    portfolio_url, why_you to applications).
 * 3. Populates missing columns for initial fictional records (INT-001 - INT-004).
 * @param {Database.Database} [targetDb]
 */
function initSchema(targetDb) {
  const db = targetDb || getDb();

  // Disable FK constraints temporarily during table recreation
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DROP TABLE IF EXISTS applications;');
  db.exec('DROP TABLE IF EXISTS internships;');
  db.exec('PRAGMA foreign_keys = ON;');

  if (!fs.existsSync(SAMPLE_SQL_PATH)) {
    throw new Error(`Base schema file not found at: ${SAMPLE_SQL_PATH}`);
  }

  const baseSql = fs.readFileSync(SAMPLE_SQL_PATH, 'utf8');
  db.exec(baseSql);

  // Check and apply extensions to internships table
  const internshipCols = db.pragma('table_info(internships)').map(c => c.name);
  if (!internshipCols.includes('location')) {
    db.exec('ALTER TABLE internships ADD COLUMN location TEXT DEFAULT "Remote";');
  }
  if (!internshipCols.includes('skills')) {
    db.exec('ALTER TABLE internships ADD COLUMN skills TEXT DEFAULT "[]";');
  }
  if (!internshipCols.includes('openings')) {
    db.exec('ALTER TABLE internships ADD COLUMN openings INTEGER NOT NULL DEFAULT 1;');
  }
  if (!internshipCols.includes('stipend')) {
    db.exec('ALTER TABLE internships ADD COLUMN stipend TEXT DEFAULT "Competitive";');
  }
  if (!internshipCols.includes('duration')) {
    db.exec('ALTER TABLE internships ADD COLUMN duration TEXT DEFAULT "Flexible";');
  }
  if (!internshipCols.includes('description')) {
    db.exec('ALTER TABLE internships ADD COLUMN description TEXT DEFAULT "";');
  }

  // Check and apply extensions to applications table
  const applicationCols = db.pragma('table_info(applications)').map(c => c.name);
  if (!applicationCols.includes('portfolio_url')) {
    db.exec('ALTER TABLE applications ADD COLUMN portfolio_url TEXT;');
  }
  if (!applicationCols.includes('why_you')) {
    db.exec('ALTER TABLE applications ADD COLUMN why_you TEXT;');
  }

  // Populate extended fields for INT-001 through INT-004 fictional starter records
  const updateFictional = db.prepare(`
    UPDATE internships SET
      location = ?,
      skills = ?,
      openings = ?,
      stipend = ?,
      duration = ?,
      description = ?
    WHERE id = ?
  `);

  updateFictional.run('Remote', JSON.stringify(['HTML', 'CSS', 'JavaScript']), 2, '₹20,000 / month', '4 Weeks', 'Hands-on frontend practice building accessible interfaces.', 'INT-001');
  updateFictional.run('Remote', JSON.stringify(['Python', 'SQL', 'Tableau']), 2, '₹22,000 / month', '6 Weeks', 'Data analytics and dashboard design internship.', 'INT-002');
  updateFictional.run('Hybrid', JSON.stringify(['Figma', 'Wireframing', 'User Research']), 1, '₹18,000 / month', '4 Weeks', 'Product design and UI/UX prototyping internship.', 'INT-003');
  updateFictional.run('Remote', JSON.stringify(['C++', 'Data Structures', 'Algorithms']), 0, '₹24,000 / month', '5 Weeks', 'High performance C++ utility engineering internship.', 'INT-004');

  return db;
}

/**
 * Idempotently seeds the internships table from data/internships.json
 * Preserves INT-101 through INT-105 exactly.
 * @param {Database.Database} [targetDb]
 */
function seedData(targetDb) {
  const db = targetDb || getDb();

  // Ensure tables exist before seeding
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='internships'").get();
  if (!tables) {
    initSchema(db);
  }

  if (!fs.existsSync(SEED_JSON_PATH)) {
    throw new Error(`Seed JSON file not found at: ${SEED_JSON_PATH}`);
  }

  const raw = fs.readFileSync(SEED_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed.internships) ? parsed.internships : [];

  const upsertStmt = db.prepare(`
    INSERT INTO internships (
      id, title, domain, mode, location, skills, openings, stipend, duration, description, duration_weeks, applications_open
    ) VALUES (
      @id, @title, @domain, @mode, @location, @skills, @openings, @stipend, @duration, @description, @duration_weeks, @applications_open
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      domain = excluded.domain,
      mode = excluded.mode,
      location = excluded.location,
      skills = excluded.skills,
      openings = excluded.openings,
      stipend = excluded.stipend,
      duration = excluded.duration,
      description = excluded.description,
      duration_weeks = excluded.duration_weeks,
      applications_open = excluded.applications_open
  `);

  const insertMany = db.transaction((internships) => {
    let count = 0;
    for (const item of internships) {
      let durationWeeks = 6;
      if (typeof item.duration === 'string') {
        const match = item.duration.match(/(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          durationWeeks = item.duration.toLowerCase().includes('month') ? num * 4 : num;
        }
      }

      upsertStmt.run({
        id: item.id,
        title: item.title,
        domain: item.domain,
        mode: item.mode,
        location: item.location || 'India',
        skills: JSON.stringify(Array.isArray(item.skills) ? item.skills : []),
        openings: Number.isInteger(item.openings) ? item.openings : 1,
        stipend: item.stipend || 'Competitive',
        duration: item.duration || '6 Months',
        description: item.description || '',
        duration_weeks: durationWeeks,
        applications_open: item.openings > 0 ? 1 : 0
      });
      count++;
    }
    return count;
  });

  const count = insertMany(items);
  return count;
}

/**
 * Ensures schema is ready; if database is empty, auto-initializes and seeds
 * @param {Database.Database} [targetDb]
 */
function ensureDbReady(targetDb) {
  const db = targetDb || getDb();
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='internships'").get();
  if (!table) {
    initSchema(db);
    seedData(db);
  } else {
    // If table exists, check if INT-101 exists; if not, seed it
    const row = db.prepare("SELECT id FROM internships WHERE id = 'INT-101'").get();
    if (!row) {
      seedData(db);
    }
  }
}

/**
 * Closes active database connection
 */
function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  initSchema,
  seedData,
  ensureDbReady,
  closeDb,
  DEFAULT_DB_PATH,
  SAMPLE_SQL_PATH,
  SEED_JSON_PATH
};
