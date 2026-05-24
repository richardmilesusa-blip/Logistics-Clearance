import request from 'supertest';
import app from '../app-server.js';
import pg from 'pg';
import { TEST_USERS, TEST_CLIENTS, TEST_JOBS, getAuthToken } from './setup.js';

const { Pool } = pg;
const dbPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  ssl: (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

describe('ClearPath Shipment Jobs API Endpoints', () => {
  const adminToken = getAuthToken(TEST_USERS.admin);
  const brokerToken = getAuthToken(TEST_USERS.broker);

  afterAll(async () => {
    await dbPool.end();
  });

  // --- POST /api/jobs ---
  describe('POST /api/jobs', () => {
    it('should successfully register a new shipment job with valid arguments', async () => {
      const payload = {
        container_no: 'CONT-NEW-500',
        bl_number: 'BL-NEW-TEST',
        shipping_line: 'MAERSK INC',
        port_of_discharge: 'ONNE PORT',
        cargo_description: 'Industrial machinery components',
        client_id: TEST_CLIENTS.client1.id,
        assigned_broker_id: TEST_USERS.broker.id,
        eta_date: new Date(Date.now() + 86400000 * 5).toISOString() // 5 days from now
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${brokerToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.container_no).toBe(payload.container_no);
      expect(res.body.data.bl_number).toBe(payload.bl_number);

      // Verify fee_summaries and bl_records are initialized dynamically by the hook
      const dbCheck = await dbPool.query('SELECT * FROM bl_records WHERE job_id = $1', [res.body.data.id]);
      expect(dbCheck.rowCount).toBe(1);
    });

    it('should return 400 when critical required fields are missing', async () => {
      const faultyPayload = {
        container_no: 'CONT-INVALID-99',
        // missing bl_number
        shipping_line: 'COSCO',
        port_of_discharge: 'APAPA PORT',
        client_id: TEST_CLIENTS.client1.id
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${brokerToken}`)
        .send(faultyPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 Conflict when unique validation on bl_number fails', async () => {
      const duplicatePayload = {
        container_no: 'CONT-DUPLICATE-777',
        bl_number: TEST_JOBS.created.bl_number, // Already registered and pre-seeded!
        shipping_line: 'MSC SHIPPING',
        port_of_discharge: 'APAPA PORT',
        cargo_description: 'Frozen poultry processing gear',
        client_id: TEST_CLIENTS.client1.id
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${brokerToken}`)
        .send(duplicatePayload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  // --- GET /api/jobs ---
  describe('GET /api/jobs', () => {
    it('should return a paginated list of registered jobs', async () => {
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });

    it('should correctly filter the output list by status query parameter', async () => {
      const res = await request(app)
        .get('/api/jobs?status=delivered')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      res.body.data.forEach(job => {
        expect(job.status).toBe('delivered');
      });
    });

    it('should search properly and return match on container_no, bl_number, or reference', async () => {
      const searchStr = 'CREATED';
      const res = await request(app)
        .get(`/api/jobs?search=${searchStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].bl_number).toBe(TEST_JOBS.created.bl_number);
    });
  });

  // --- PUT /api/jobs/:id/status ---
  describe('PUT /api/jobs/:id/status', () => {
    it('should successfully transition job stage when transition path is valid and prerequisites are satisfied', async () => {
      const jobId = TEST_JOBS.created.id; // status: created. Has seeded bl_record. Target: docs_review

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'docs_review' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('docs_review');

      // Verify audit logger row creation
      const auditResult = await dbPool.query(
        "SELECT * FROM audit_logs WHERE job_id = $1 AND action = 'status_changed' ORDER BY created_at DESC LIMIT 1",
        [jobId]
      );
      expect(auditResult.rowCount).toBe(1);
      expect(JSON.parse(auditResult.rows[0].new_value).status).toBe('docs_review');
    });

    it('should return 422 Unprocessable Entity when jumping to a non-sequential status', async () => {
      const jobId = TEST_JOBS.docs_review.id; // status: docs_review. Target: delivered (forces invalid sequence)

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'delivered' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid status transition sequence');
    });

    it('should reject transitions from cancelled statuses', async () => {
      const jobId = TEST_JOBS.cancelled.id; // status: cancelled. Cannot be migrated further.

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'created' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });
});
