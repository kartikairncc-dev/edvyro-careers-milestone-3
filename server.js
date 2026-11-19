/**
 * EdVyro Careers - Responsive Internship Board Server
 * Milestone 3: Express.js + SQLite (better-sqlite3) REST API
 */

const express = require('express');
const path = require('path');
require('dotenv').config();

const { getDb, ensureDbReady, closeDb } = require('./db/database');
const { router: internshipsRouter } = require('./routes/internships');
const { router: applicationsRouter } = require('./routes/applications');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// =============================================================================
// Security & Privacy-Preserving Logging Middleware
// RULE: Logs method, path, status code, duration ONLY.
// NEVER log request bodies, passwords, tokens, or applicant records.
// =============================================================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const pathUrl = req.originalUrl || req.url;
    const status = res.statusCode;
    console.log(`[${new Date().toISOString()}] ${method} ${pathUrl} ${status} - ${duration}ms`);
  });
  next();
});

// Security headers & CORS
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// JSON body parser with 1MB maximum payload guard
app.use(express.json({ limit: '1mb' }));

// Serve static frontend assets from public/ directory
app.use(express.static(PUBLIC_DIR));

// =============================================================================
// API Routes
// =============================================================================
app.use('/api/internships', internshipsRouter);
app.use('/api/applications', applicationsRouter);

// =============================================================================
// 404 Handler for Unknown Routes (JSON envelope)
// =============================================================================
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    data: null,
    message: `Cannot ${req.method} ${req.originalUrl || req.url}`
  });
});

// =============================================================================
// Global Error Handler
// Consistent envelope everywhere:
// - 400 Bad Request for malformed JSON bodies
// - 409 Conflict for SQLite unique constraint violations
// - 500 Internal Server Error (Generic message, strictly NO stack trace)
// =============================================================================
app.use((err, req, res, next) => {
  // Catch invalid JSON syntax in request body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      data: null,
      message: 'Invalid JSON format in request body.',
      errors: [
        { field: 'body', message: 'Malformed JSON payload.' }
      ]
    });
  }

  // Catch SQLite unique constraint violations
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      status: 'error',
      data: null,
      message: 'Conflict: Duplicate record already exists.',
      errors: [
        { field: 'general', message: 'Unique constraint violated.' }
      ]
    });
  }

  // Catch other payload limit errors
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      status: 'error',
      data: null,
      message: 'Payload too large. Maximum size is 1 MB.',
      errors: [
        { field: 'body', message: 'Request payload exceeded 1 MB limit.' }
      ]
    });
  }

  // Generic 500 Server Error - Never leak stack traces to client
  console.error('[UNHANDLED SERVER ERROR]', err.message);
  return res.status(500).json({
    status: 'error',
    data: null,
    message: 'Internal server error'
  });
});

let server = null;

// Start listening if run directly via `node server.js`
if (require.main === module) {
  // Ensure database tables and initial seed data exist
  ensureDbReady();

  server = app.listen(PORT, HOST, () => {
    console.log('====================================================');
    console.log('  EdVyro Careers Internship Board Server (Express)  ');
    console.log(`  URL: http://localhost:${PORT}                     `);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'} `);
    console.log('====================================================');
  });

  // Graceful shutdown
  const handleShutdown = () => {
    console.log('\n[SHUTDOWN] Closing server and database connection...');
    if (server) {
      server.close(() => {
        closeDb();
        console.log('[SHUTDOWN] Server stopped gracefully.');
        process.exit(0);
      });
    } else {
      closeDb();
      process.exit(0);
    }
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}

// Export app and server for automated testing and supertest
app.app = app;
app.getDb = getDb;
app.closeDb = closeDb;
app.ensureDbReady = ensureDbReady;

module.exports = app;
