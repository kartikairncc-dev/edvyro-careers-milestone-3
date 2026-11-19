/**
 * EdVyro Careers - Applications API Router
 * Endpoints:
 *   POST /api/applications (Submit candidate application)
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

/**
 * Validates application payload
 * @param {object} data
 * @param {Database.Database} db
 * @returns {Array<{field: string, message: string}>}
 */
function validateApplicationInput(data, db) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [{ field: 'body', message: 'Request body must be a valid JSON object.' }];
  }

  // 1. Internship ID validation (accepts internshipId or internship_id)
  const rawInternshipId = data.internshipId || data.internship_id;
  if (!rawInternshipId || typeof rawInternshipId !== 'string' || rawInternshipId.trim().length === 0) {
    errors.push({ field: 'internshipId', message: 'Internship ID is required.' });
  } else {
    const internship = db.prepare('SELECT id FROM internships WHERE UPPER(id) = UPPER(?)').get(rawInternshipId.trim());
    if (!internship) {
      errors.push({
        field: 'internshipId',
        message: `Internship with ID "${rawInternshipId}" does not exist.`
      });
    }
  }

  // 2. Full Name validation (accepts fullName, name, applicantName, applicant_name)
  const rawName = data.fullName || data.name || data.applicantName || data.applicant_name;
  if (!rawName || typeof rawName !== 'string' || rawName.trim().length < 2) {
    errors.push({
      field: 'fullName',
      message: 'Full name is required (minimum 2 characters).'
    });
  }

  // 3. Email validation (accepts email, applicantEmail, applicant_email)
  const rawEmail = data.email || data.applicantEmail || data.applicant_email;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!rawEmail || typeof rawEmail !== 'string' || !emailRegex.test(rawEmail.trim())) {
    errors.push({
      field: 'email',
      message: 'A valid email address is required (e.g., student@university.edu).'
    });
  }

  // 4. Portfolio / GitHub URL validation (accepts portfolioUrl or portfolio_url)
  const rawPortfolio = data.portfolioUrl || data.portfolio_url;
  if (rawPortfolio && typeof rawPortfolio === 'string' && rawPortfolio.trim().length > 0) {
    const trimmedUrl = rawPortfolio.trim();
    try {
      const parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        errors.push({
          field: 'portfolioUrl',
          message: 'Portfolio URL must use http:// or https:// (unsafe schemes like javascript: are prohibited).'
        });
      }
    } catch (_) {
      errors.push({
        field: 'portfolioUrl',
        message: 'Portfolio URL must be a valid, well-formed URL (e.g., https://github.com/username).'
      });
    }
  }

  // 5. Why You statement (optional in general, but if provided should be valid string)
  const rawWhy = data.whyYou !== undefined ? data.whyYou : data.why_you;
  if (rawWhy !== undefined && rawWhy !== null && typeof rawWhy === 'string' && rawWhy.trim().length > 0 && rawWhy.trim().length < 10) {
    errors.push({
      field: 'whyYou',
      message: 'Why You statement must be at least 10 characters if provided.'
    });
  }

  return errors;
}

// =============================================================================
// POST /api/applications (Submit candidate application)
// =============================================================================
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const errors = validateApplicationInput(req.body, db);

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        data: null,
        message: `Validation failed: ${errors.map(e => e.message).join(' ')}`,
        errors
      });
    }

    const internshipId = (req.body.internshipId || req.body.internship_id).trim().toUpperCase();
    const applicantName = (req.body.fullName || req.body.name || req.body.applicantName || req.body.applicant_name).trim();
    const applicantEmail = (req.body.email || req.body.applicantEmail || req.body.applicant_email).trim().toLowerCase();
    const rawPortfolio = req.body.portfolioUrl || req.body.portfolio_url;
    const portfolioUrl = rawPortfolio && typeof rawPortfolio === 'string' ? rawPortfolio.trim() : null;
    const rawWhy = req.body.whyYou !== undefined ? req.body.whyYou : req.body.why_you;
    const whyYou = rawWhy && typeof rawWhy === 'string' ? rawWhy.trim() : null;

    // Check for duplicate application (same email + internship id)
    const duplicateCheckStmt = db.prepare(`
      SELECT id FROM applications
      WHERE UPPER(internship_id) = UPPER(?) AND LOWER(applicant_email) = LOWER(?)
    `);
    const duplicate = duplicateCheckStmt.get(internshipId, applicantEmail);

    if (duplicate) {
      return res.status(409).json({
        status: 'error',
        data: null,
        message: 'Duplicate application: You have already applied for this internship position.',
        errors: [
          {
            field: 'email',
            message: 'An application with this email already exists for this internship position.'
          }
        ]
      });
    }

    // Insert new application into SQLite database
    const createdAt = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO applications (
        internship_id, applicant_name, applicant_email, portfolio_url, why_you, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = insertStmt.run(
      internshipId,
      applicantName,
      applicantEmail,
      portfolioUrl,
      whyYou,
      createdAt
    );

    const applicationId = `APP-${info.lastInsertRowid}`;

    res.status(201).json({
      status: 'success',
      data: {
        id: Number(info.lastInsertRowid),
        applicationId,
        internshipId,
        applicantName,
        applicantEmail,
        portfolioUrl: portfolioUrl || '',
        whyYou: whyYou || '',
        createdAt
      },
      message: 'Application submitted successfully! Our talent team will review your profile.'
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        status: 'error',
        data: null,
        message: 'Duplicate application: You have already applied for this internship position.',
        errors: [
          {
            field: 'email',
            message: 'An application with this email already exists for this internship position.'
          }
        ]
      });
    }
    next(err);
  }
});

module.exports = {
  router,
  validateApplicationInput
};
