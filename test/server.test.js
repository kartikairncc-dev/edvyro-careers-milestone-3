/**
 * EdVyro Careers - Automated Test Suite
 * Powered by node:test + node:assert/strict + supertest
 * Milestone 3: REST API and Persistent Data
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { getDb, initSchema, seedData, closeDb } = require('../db/database');

let db;

before(() => {
  // Initialize pristine schema and seed data
  db = getDb();
  initSchema(db);
  seedData(db);
});

after(() => {
  closeDb();
});

// =============================================================================
// SECTION 1: GET /api/internships (List, Pagination, Filtering, Search)
// =============================================================================
test('GET /api/internships: Returns 200 with standard response envelope and pagination', async () => {
  const res = await request(app).get('/api/internships');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'success');
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length > 0);
  assert.equal(typeof res.body.message, 'string');
  assert.ok(res.body.pagination);
  assert.equal(res.body.pagination.page, 1);
  assert.ok(res.body.pagination.total >= 9);
  assert.ok(res.body.pagination.totalPages >= 1);
});

test('GET /api/internships?page=1&limit=2: Respects pagination limits', async () => {
  const res = await request(app).get('/api/internships?page=1&limit=2');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.limit, 2);
});

test('GET /api/internships?limit=100: Enforces max limit cap of 50', async () => {
  const res = await request(app).get('/api/internships?limit=100');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.limit, 50);
});

test('GET /api/internships?search=frontend: Matches title and skills containing frontend', async () => {
  const res = await request(app).get('/api/internships?search=frontend');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 2);
  const ids = res.body.data.map(i => i.id);
  assert.ok(ids.includes('INT-101'));
  assert.ok(ids.includes('INT-001'));
});

test('GET /api/internships?domain=UI/UX: Filters correctly by domain', async () => {
  const res = await request(app).get('/api/internships?domain=UI/UX');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 2);
  for (const item of res.body.data) {
    assert.equal(item.domain, 'UI/UX');
  }
});

test('GET /api/internships?mode=Hybrid: Filters correctly by work mode', async () => {
  const res = await request(app).get('/api/internships?mode=Hybrid');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 2);
  for (const item of res.body.data) {
    assert.equal(item.mode, 'Hybrid');
  }
});

test('GET /api/internships?search=NonExistentSkillXYZ: Returns empty data array', async () => {
  const res = await request(app).get('/api/internships?search=NonExistentSkillXYZ');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
  assert.equal(res.body.pagination.total, 0);
});

// =============================================================================
// SECTION 2: GET /api/internships/:id (Retrieve Single Internship)
// =============================================================================
test('GET /api/internships/INT-101: Returns 200 OK with complete details', async () => {
  const res = await request(app).get('/api/internships/INT-101');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.data.id, 'INT-101');
  assert.equal(res.body.data.title, 'Frontend Intern');
  assert.equal(res.body.data.domain, 'Full Stack Development');
  assert.equal(res.body.data.mode, 'Remote');
  assert.ok(Array.isArray(res.body.data.skills));
  assert.ok(res.body.data.skills.includes('HTML'));
  assert.equal(res.body.data.openings, 3);
});

test('GET /api/internships/int-101: Case-insensitive ID lookup', async () => {
  const res = await request(app).get('/api/internships/int-101');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, 'INT-101');
});

test('GET /api/internships/INT-999: Returns 404 Not Found for missing ID', async () => {
  const res = await request(app).get('/api/internships/INT-999');
  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
  assert.equal(res.body.data, null);
  assert.ok(res.body.message.includes('not found'));
});

// =============================================================================
// SECTION 3: POST /api/internships (Create Internship)
// =============================================================================
test('POST /api/internships: Successfully creates internship with 201 Created', async () => {
  const payload = {
    title: 'Cloud DevOps Intern',
    domain: 'Cloud Computing',
    mode: 'Remote',
    location: 'India',
    skills: ['AWS', 'Docker', 'Kubernetes'],
    openings: 2,
    description: 'Work with cloud infrastructure and CI/CD pipelines.',
    stipend: '₹30,000 / month',
    duration: '6 Months'
  };

  const res = await request(app)
    .post('/api/internships')
    .send(payload);

  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'success');
  assert.ok(res.body.data.id.startsWith('INT-'));
  assert.equal(res.body.data.title, 'Cloud DevOps Intern');
  assert.deepEqual(res.body.data.skills, ['AWS', 'Docker', 'Kubernetes']);
  assert.equal(res.body.data.openings, 2);

  // Verify created record is retrievable via GET
  const getRes = await request(app).get(`/api/internships/${res.body.data.id}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data.title, 'Cloud DevOps Intern');
});

test('POST /api/internships: Rejects unknown fields with 400 Bad Request', async () => {
  const payload = {
    title: 'AI Intern',
    domain: 'Machine Learning',
    mode: 'Remote',
    location: 'Remote',
    skills: ['Python', 'PyTorch'],
    openings: 1,
    unauthorizedField: 'malicious-data',
    anotherUnknown: 12345
  };

  const res = await request(app)
    .post('/api/internships')
    .send(payload);

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
  assert.ok(res.body.message.includes('Unknown field'));
  assert.ok(Array.isArray(res.body.errors));
  assert.ok(res.body.errors.some(e => e.field === 'unauthorizedField'));
});

test('POST /api/internships: Rejects missing required fields with 400 and field errors', async () => {
  const res = await request(app)
    .post('/api/internships')
    .send({});

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
  assert.ok(res.body.errors.some(e => e.field === 'title'));
  assert.ok(res.body.errors.some(e => e.field === 'domain'));
  assert.ok(res.body.errors.some(e => e.field === 'mode'));
  assert.ok(res.body.errors.some(e => e.field === 'location'));
  assert.ok(res.body.errors.some(e => e.field === 'skills'));
  assert.ok(res.body.errors.some(e => e.field === 'openings'));
});

test('POST /api/internships: Rejects invalid mode values with 400', async () => {
  const payload = {
    title: 'Security Intern',
    domain: 'Cyber Security',
    mode: 'InvalidModeXYZ', // Only Remote | Hybrid | On-site allowed
    location: 'Delhi',
    skills: ['Wireshark', 'Bash'],
    openings: 1
  };

  const res = await request(app)
    .post('/api/internships')
    .send(payload);

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some(e => e.field === 'mode'));
});

test('POST /api/internships: Rejects negative openings with 400', async () => {
  const payload = {
    title: 'QA Intern',
    domain: 'Quality Assurance',
    mode: 'Remote',
    location: 'India',
    skills: ['Selenium', 'Jest'],
    openings: -3
  };

  const res = await request(app)
    .post('/api/internships')
    .send(payload);

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some(e => e.field === 'openings'));
});

// =============================================================================
// SECTION 4: PUT /api/internships/:id (Update Internship)
// =============================================================================
test('PUT /api/internships/INT-102: Successfully updates internship details (200 OK)', async () => {
  const updatePayload = {
    title: 'Senior API Engineering Intern',
    openings: 5,
    mode: 'Remote'
  };

  const res = await request(app)
    .put('/api/internships/INT-102')
    .send(updatePayload);

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.data.id, 'INT-102');
  assert.equal(res.body.data.title, 'Senior API Engineering Intern');
  assert.equal(res.body.data.openings, 5);
  assert.equal(res.body.data.mode, 'Remote');
});

test('PUT /api/internships/INT-999: Returns 404 when updating non-existent ID', async () => {
  const res = await request(app)
    .put('/api/internships/INT-999')
    .send({ title: 'New Title' });

  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
});

test('PUT /api/internships/INT-102: Rejects invalid fields on update (400 Bad Request)', async () => {
  const res = await request(app)
    .put('/api/internships/INT-102')
    .send({ openings: -10 });

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
  assert.ok(res.body.errors.some(e => e.field === 'openings'));
});

test('PUT /api/internships/INT-102: Rejects empty payload with 400 Bad Request', async () => {
  const res = await request(app)
    .put('/api/internships/INT-102')
    .send({});

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
});

// =============================================================================
// SECTION 5: DELETE /api/internships/:id (Delete Internship)
// =============================================================================
test('DELETE /api/internships/:id: Successfully deletes internship (200 OK)', async () => {
  // First create a temporary internship to delete
  const createRes = await request(app)
    .post('/api/internships')
    .send({
      title: 'Temporary Intern',
      domain: 'Testing',
      mode: 'Remote',
      location: 'Remote',
      skills: ['Testing'],
      openings: 1
    });

  const tempId = createRes.body.data.id;

  // Delete it
  const delRes = await request(app).delete(`/api/internships/${tempId}`);
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.status, 'success');
  assert.ok(delRes.body.message.includes('deleted'));

  // Confirm it no longer exists
  const getRes = await request(app).get(`/api/internships/${tempId}`);
  assert.equal(getRes.status, 404);
});

test('DELETE /api/internships/INT-999: Returns 404 Not Found for missing ID', async () => {
  const res = await request(app).delete('/api/internships/INT-999');
  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
});

// =============================================================================
// SECTION 6: POST /api/applications (Candidate Applications & Validation)
// =============================================================================
test('POST /api/applications: Successfully submits valid candidate application (201 Created)', async () => {
  const payload = {
    internshipId: 'INT-101',
    fullName: 'Rahul Sharma',
    email: 'rahul.sharma@university.edu',
    portfolioUrl: 'https://github.com/rahulsharma',
    whyYou: 'Passionate full-stack developer with 2+ years of React and Node.js project experience.'
  };

  const res = await request(app)
    .post('/api/applications')
    .send(payload);

  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'success');
  assert.ok(res.body.data.applicationId.startsWith('APP-'));
  assert.equal(res.body.data.internshipId, 'INT-101');
  assert.equal(res.body.data.applicantEmail, 'rahul.sharma@university.edu');
});

test('POST /api/applications: Rejects duplicate application with same email + internshipId (409 Conflict)', async () => {
  const duplicatePayload = {
    internshipId: 'INT-101',
    fullName: 'Rahul Sharma Duplicate',
    email: 'rahul.sharma@university.edu', // Duplicate email for INT-101
    portfolioUrl: 'https://github.com/rahulsharma',
    whyYou: 'Applying again for the same position.'
  };

  const res = await request(app)
    .post('/api/applications')
    .send(duplicatePayload);

  assert.equal(res.status, 409);
  assert.equal(res.body.status, 'error');
  assert.ok(res.body.message.includes('Duplicate application'));
});

test('POST /api/applications: Rejects missing or blank applicant name with 400', async () => {
  const payload = {
    internshipId: 'INT-101',
    fullName: '   ',
    email: 'student@college.edu'
  };

  const res = await request(app)
    .post('/api/applications')
    .send(payload);

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some(e => e.field === 'fullName'));
});

test('POST /api/applications: Rejects invalid email format with 400', async () => {
  const invalidEmails = ['plainaddress', '@missingusername.com', 'user@domain'];
  for (const email of invalidEmails) {
    const res = await request(app)
      .post('/api/applications')
      .send({
        internshipId: 'INT-101',
        fullName: 'Jane Doe',
        email
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some(e => e.field === 'email'));
  }
});

test('POST /api/applications: Rejects unsafe portfolio URL schemes (e.g. javascript:) with 400', async () => {
  const unsafeUrls = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd'];
  for (const badUrl of unsafeUrls) {
    const res = await request(app)
      .post('/api/applications')
      .send({
        internshipId: 'INT-101',
        fullName: 'Secure Dev',
        email: 'secure.dev@college.edu',
        portfolioUrl: badUrl
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some(e => e.field === 'portfolioUrl'));
  }
});

test('POST /api/applications: Rejects unknown / non-existent internship ID with 400', async () => {
  const res = await request(app)
    .post('/api/applications')
    .send({
      internshipId: 'INT-999-FAKE',
      fullName: 'Valid Name',
      email: 'valid.name@college.edu'
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some(e => e.field === 'internshipId'));
});

// =============================================================================
// SECTION 7: Error Handlers & Security
// =============================================================================
test('Global Error Handler: Rejects malformed JSON with 400 Bad Request envelope', async () => {
  const res = await request(app)
    .post('/api/internships')
    .set('Content-Type', 'application/json')
    .send('{ malformed json body ');

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
  assert.ok(res.body.message.includes('Invalid JSON format'));
});

test('404 Handler: Returns JSON envelope for unknown route', async () => {
  const res = await request(app).get('/api/unknown-nonexistent-endpoint');
  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
  assert.ok(res.body.message.includes('Cannot GET'));
});

test('Static Files: GET / serves index.html with 200 OK', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('EdVyro Careers'));
});
