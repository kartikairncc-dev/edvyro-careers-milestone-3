/**
 * EdVyro Careers - Internships API Router
 * Endpoints:
 *   GET    /api/internships
 *   GET    /api/internships/:id
 *   POST   /api/internships
 *   PUT    /api/internships/:id
 *   DELETE /api/internships/:id
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// Allowed fields for create/update operations
const ALLOWED_INTERNSHIP_FIELDS = new Set([
  'title',
  'domain',
  'mode',
  'location',
  'skills',
  'openings',
  'description',
  'stipend',
  'duration'
]);

/**
 * Format a raw database row into an internship object conforming to the API schema
 * @param {object} row
 * @returns {object|null}
 */
function formatInternship(row) {
  if (!row) return null;
  let skills = [];
  if (Array.isArray(row.skills)) {
    skills = row.skills;
  } else if (typeof row.skills === 'string') {
    try {
      skills = JSON.parse(row.skills);
      if (!Array.isArray(skills)) skills = [String(skills)];
    } catch (_) {
      skills = row.skills ? row.skills.split(',').map(s => s.trim()) : [];
    }
  }

  return {
    id: row.id,
    title: row.title,
    domain: row.domain,
    mode: row.mode,
    location: row.location || 'Remote',
    skills,
    openings: Number.isInteger(row.openings) ? row.openings : (row.applications_open ? 1 : 0),
    stipend: row.stipend || 'Competitive',
    duration: row.duration || (row.duration_weeks ? `${row.duration_weeks} Weeks` : 'Flexible'),
    description: row.description || ''
  };
}

/**
 * Validates internship payload for create and update
 * @param {object} data
 * @param {boolean} isUpdate
 * @returns {Array<{field: string, message: string}>}
 */
function validateInternshipInput(data, isUpdate = false) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [{ field: 'body', message: 'Request body must be a valid JSON object.' }];
  }

  const keys = Object.keys(data);

  if (isUpdate && keys.length === 0) {
    return [{ field: 'body', message: 'At least one field must be provided for update.' }];
  }

  // Reject unknown fields
  for (const key of keys) {
    if (!ALLOWED_INTERNSHIP_FIELDS.has(key)) {
      errors.push({ field: key, message: `Unknown field "${key}" is not allowed.` });
    }
  }

  // Validate Title
  if (!isUpdate || 'title' in data) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required and must be a non-empty string.' });
    }
  }

  // Validate Domain
  if (!isUpdate || 'domain' in data) {
    if (typeof data.domain !== 'string' || data.domain.trim().length === 0) {
      errors.push({ field: 'domain', message: 'Domain is required and must be a non-empty string.' });
    }
  }

  // Validate Mode (Remote | Hybrid | On-site)
  if (!isUpdate || 'mode' in data) {
    const validModes = ['Remote', 'Hybrid', 'On-site'];
    if (typeof data.mode !== 'string' || !validModes.includes(data.mode.trim())) {
      errors.push({ field: 'mode', message: 'Mode must be one of: Remote, Hybrid, On-site.' });
    }
  }

  // Validate Location
  if (!isUpdate || 'location' in data) {
    if (typeof data.location !== 'string' || data.location.trim().length === 0) {
      errors.push({ field: 'location', message: 'Location is required and must be a non-empty string.' });
    }
  }

  // Validate Skills (array of non-empty strings)
  if (!isUpdate || 'skills' in data) {
    if (
      !Array.isArray(data.skills) ||
      data.skills.length === 0 ||
      !data.skills.every(s => typeof s === 'string' && s.trim().length > 0)
    ) {
      errors.push({ field: 'skills', message: 'Skills must be a non-empty array of strings.' });
    }
  }

  // Validate Openings (integer >= 0)
  if (!isUpdate || 'openings' in data) {
    if (typeof data.openings !== 'number' || !Number.isInteger(data.openings) || data.openings < 0) {
      errors.push({ field: 'openings', message: 'Openings must be an integer greater than or equal to 0.' });
    }
  }

  // Validate optional string fields if present
  if ('description' in data && data.description !== null && typeof data.description !== 'string') {
    errors.push({ field: 'description', message: 'Description must be a string.' });
  }
  if ('stipend' in data && data.stipend !== null && typeof data.stipend !== 'string') {
    errors.push({ field: 'stipend', message: 'Stipend must be a string.' });
  }
  if ('duration' in data && data.duration !== null && typeof data.duration !== 'string') {
    errors.push({ field: 'duration', message: 'Duration must be a string.' });
  }

  return errors;
}

// =============================================================================
// GET /api/internships (List with search, filters, pagination)
// =============================================================================
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const domain = typeof req.query.domain === 'string' ? req.query.domain.trim() : '';
    const mode = typeof req.query.mode === 'string' ? req.query.mode.trim() : '';

    // Pagination calculations (limit capped at max 50)
    const rawPage = parseInt(req.query.page, 10);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

    const rawLimit = parseInt(req.query.limit, 10);
    let limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 10;
    if (limit > 50) limit = 50; // Cap at max 50 as mandated

    const whereClauses = [];
    const params = [];

    // Search filter across title, domain, location, skills, description
    if (search) {
      whereClauses.push('(LOWER(title) LIKE ? OR LOWER(domain) LIKE ? OR LOWER(location) LIKE ? OR LOWER(skills) LIKE ? OR LOWER(description) LIKE ?)');
      const pattern = `%${search.toLowerCase()}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    // Domain filter
    if (domain && domain.toLowerCase() !== 'all') {
      whereClauses.push('LOWER(domain) = LOWER(?)');
      params.push(domain);
    }

    // Work Mode filter
    if (mode && mode.toLowerCase() !== 'all') {
      whereClauses.push('LOWER(mode) = LOWER(?)');
      params.push(mode);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Parameterized count query
    const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM internships ${whereSql}`);
    const { total } = countStmt.get(...params);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    // Parameterized paginated query
    const dataStmt = db.prepare(`
      SELECT * FROM internships
      ${whereSql}
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(...params, limit, offset);

    const formattedList = rows.map(formatInternship);

    res.status(200).json({
      status: 'success',
      data: formattedList,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      message: 'Internships retrieved successfully.'
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// GET /api/internships/:id (Single internship details)
// =============================================================================
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id.trim();

    const stmt = db.prepare('SELECT * FROM internships WHERE UPPER(id) = UPPER(?)');
    const row = stmt.get(id);

    if (!row) {
      return res.status(404).json({
        status: 'error',
        data: null,
        message: `Internship with ID "${id}" was not found.`
      });
    }

    res.status(200).json({
      status: 'success',
      data: formatInternship(row),
      message: 'Internship details retrieved successfully.'
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// POST /api/internships (Create new internship)
// =============================================================================
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const errors = validateInternshipInput(req.body, false);

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        data: null,
        message: `Validation failed: ${errors.map(e => e.message).join(' ')}`,
        errors
      });
    }

    const {
      title,
      domain,
      mode,
      location,
      skills,
      openings,
      description = '',
      stipend = 'Competitive',
      duration = '6 Months'
    } = req.body;

    // Generate unique ID (INT-106, INT-107, etc.)
    const existingIds = db.prepare("SELECT id FROM internships WHERE id LIKE 'INT-%'").all();
    let maxNum = 100;
    for (const row of existingIds) {
      const match = row.id.match(/^INT-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const newId = `INT-${maxNum + 1}`;

    let durationWeeks = 6;
    if (typeof duration === 'string') {
      const match = duration.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        durationWeeks = duration.toLowerCase().includes('month') ? num * 4 : num;
      }
    }

    const insertStmt = db.prepare(`
      INSERT INTO internships (
        id, title, domain, mode, location, skills, openings, stipend, duration, description, duration_weeks, applications_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      newId,
      title.trim(),
      domain.trim(),
      mode.trim(),
      location.trim(),
      JSON.stringify(skills.map(s => s.trim())),
      openings,
      stipend ? stipend.trim() : 'Competitive',
      duration ? duration.trim() : '6 Months',
      description ? description.trim() : '',
      durationWeeks,
      openings > 0 ? 1 : 0
    );

    const created = db.prepare('SELECT * FROM internships WHERE id = ?').get(newId);

    res.status(201).json({
      status: 'success',
      data: formatInternship(created),
      message: 'Internship created successfully.'
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// PUT /api/internships/:id (Update internship)
// =============================================================================
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id.trim();

    // Check if internship exists
    const existing = db.prepare('SELECT * FROM internships WHERE UPPER(id) = UPPER(?)').get(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        data: null,
        message: `Internship with ID "${id}" was not found.`
      });
    }

    const errors = validateInternshipInput(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        data: null,
        message: `Validation failed: ${errors.map(e => e.message).join(' ')}`,
        errors
      });
    }

    const {
      title,
      domain,
      mode,
      location,
      skills,
      openings,
      description,
      stipend,
      duration
    } = req.body;

    let updatedDurationWeeks = existing.duration_weeks;
    if (duration && typeof duration === 'string') {
      const match = duration.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        updatedDurationWeeks = duration.toLowerCase().includes('month') ? num * 4 : num;
      }
    }

    const updatedOpenings = openings !== undefined ? openings : existing.openings;
    const updatedAppsOpen = updatedOpenings > 0 ? 1 : 0;

    const updateStmt = db.prepare(`
      UPDATE internships SET
        title = COALESCE(?, title),
        domain = COALESCE(?, domain),
        mode = COALESCE(?, mode),
        location = COALESCE(?, location),
        skills = COALESCE(?, skills),
        openings = COALESCE(?, openings),
        stipend = COALESCE(?, stipend),
        duration = COALESCE(?, duration),
        description = COALESCE(?, description),
        duration_weeks = ?,
        applications_open = ?
      WHERE UPPER(id) = UPPER(?)
    `);

    updateStmt.run(
      title !== undefined ? title.trim() : null,
      domain !== undefined ? domain.trim() : null,
      mode !== undefined ? mode.trim() : null,
      location !== undefined ? location.trim() : null,
      skills !== undefined ? JSON.stringify(skills.map(s => s.trim())) : null,
      openings !== undefined ? openings : null,
      stipend !== undefined ? stipend.trim() : null,
      duration !== undefined ? duration.trim() : null,
      description !== undefined ? description.trim() : null,
      updatedDurationWeeks,
      updatedAppsOpen,
      id
    );

    const updatedRow = db.prepare('SELECT * FROM internships WHERE UPPER(id) = UPPER(?)').get(id);

    res.status(200).json({
      status: 'success',
      data: formatInternship(updatedRow),
      message: 'Internship updated successfully.'
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// DELETE /api/internships/:id (Delete internship)
// =============================================================================
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id.trim();

    const existing = db.prepare('SELECT id FROM internships WHERE UPPER(id) = UPPER(?)').get(id);
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        data: null,
        message: `Internship with ID "${id}" was not found.`
      });
    }

    // Delete child applications first
    db.prepare('DELETE FROM applications WHERE UPPER(internship_id) = UPPER(?)').run(existing.id);

    // Delete internship
    db.prepare('DELETE FROM internships WHERE UPPER(id) = UPPER(?)').run(existing.id);

    res.status(200).json({
      status: 'success',
      data: null,
      message: `Internship with ID "${existing.id}" was deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
  formatInternship,
  validateInternshipInput
};
