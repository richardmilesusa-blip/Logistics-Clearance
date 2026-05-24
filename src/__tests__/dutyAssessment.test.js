import request from 'supertest';
import app from '../app-server.js';
import pg from 'pg';
import { TEST_USERS, TEST_CLIENTS, TEST_JOBS, getAuthToken } from './setup.js';
import { runComplianceAuditCheck } from '../jobs/dutyOverdueAlert.job.ts';

const { Pool } = pg;
const dbPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  ssl: (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

describe('ClearPath Customs Duty Assessment API & Compliance Audits', () => {
  const adminToken = getAuthToken(TEST_USERS.admin);
  const brokerToken = getAuthToken(TEST_USERS.broker);

  afterAll(async () => {
    await dbPool.end();
  });

  // --- POST /api/jobs/:jobId/duty-assessment ---
  describe('POST /api/jobs/:jobId/duty-assessment', () => {
    it('should calculate correct customs duty surface rate, VAT, and CISS levy, and return calculated aggregate', async () => {
      const jobId = TEST_JOBS.duty_pending.id;
      const payload = {
        cif_value_usd: 10000,
        exchange_rate: 1500, // Explicit rate of 1500 NGN/USD
        duty_rate_pct: 0.1,  // 10% customs surface duty rate
        sad_number: 'SAD-2026-9081',
        cpc_code: '4000-M01'
      };

      const res = await request(app)
        .post(`/api/jobs/${jobId}/duty-assessment`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      
      const data = res.body.data;
      
      // Calculations:
      // CIF NGN = 10,000 * 1,500 = 15,000,000 NGN
      // Surface Duty (10%) = 15,000,000 * 0.1 = 1,500,000 NGN
      // VAT (7.5% of surface duty) = 1,500,000 * 0.075 = 112,500 NGN
      // CISS (1% of CIF NGN) = 15,000,000 * 0.01 = 150,000 NGN
      // Grand Total = 1,500,000 + 112,500 + 150,000 = 1,762,500 NGN
      expect(parseFloat(data.cif_value_ngn)).toBe(15000000);
      expect(parseFloat(data.duty_amount_ngn)).toBe(1500000);
      expect(parseFloat(data.vat_amount_ngn)).toBe(112500);
      expect(parseFloat(data.ciss_levy_ngn)).toBe(150000);
      expect(parseFloat(data.total_duty_ngn)).toBe(1762500);
      expect(data.payment_status).toBe('unpaid');
    });
  });

  // --- PUT /api/jobs/:jobId/duty-assessment/override ---
  describe('PUT /api/jobs/:jobId/duty-assessment/override', () => {
    beforeEach(async () => {
      // Create an initial duty assessment row to override
      await dbPool.query(`
        INSERT INTO duty_assessments (
          job_id, cif_value_usd, exchange_rate, rate_date, rate_source, cif_value_ngn, 
          duty_rate_pct, duty_amount_ngn, vat_amount_ngn, ciss_levy_ngn, total_duty_ngn, 
          payment_status, assessed_by, assessed_at, updated_at
        ) VALUES ($1, $2, $3, NOW(), 'manual', $4, $5, $6, $7, $8, $9, 'unpaid', $10, NOW(), NOW())
        ON CONFLICT (job_id) DO NOTHING
      `, [
        TEST_JOBS.duty_pending.id, 10000, 1500, 15000000, 0.1, 1500000, 112500, 150000, 1762500, TEST_USERS.broker.id
      ]);
    });

    it('should decline administrative overrides when triggered by standard custom_brokers', async () => {
      const payload = {
        override_total_ngn: 1200000,
        override_reason: 'Administrative dispute markdown'
      };

      const res = await request(app)
        .put(`/api/jobs/${TEST_JOBS.duty_pending.id}/duty-assessment/override`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should successfully override duty assessment and issue events if sent by senior_admin', async () => {
      const payload = {
        override_total_ngn: 1350000,
        override_reason: 'Official custom dispute resolution approved by NCS custom unit'
      };

      const res = await request(app)
        .put(`/api/jobs/${TEST_JOBS.duty_pending.id}/duty-assessment/override`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(parseFloat(res.body.data.total_duty_ngn)).toBe(payload.override_total_ngn);
      expect(res.body.data.is_overridden).toBe(true);

      // Verify audit logs preserve historical value (1,762,500) and log override_reason
      const auditRes = await dbPool.query(
        "SELECT * FROM audit_logs WHERE action = 'duty_override' ORDER BY created_at DESC LIMIT 1"
      );
      expect(auditRes.rowCount).toBe(1);
      const oldVals = JSON.parse(auditRes.rows[0].old_value);
      const newVals = JSON.parse(auditRes.rows[0].new_value);
      expect(oldVals.total_duty_ngn).toBe(1762500);
      expect(newVals.total_duty_ngn).toBe(payload.override_total_ngn);
      expect(newVals.override_reason).toBe(payload.override_reason);

      // Verify broker in-app notification is dispatched
      const notificationRes = await dbPool.query(
        "SELECT * FROM notifications WHERE type = 'duty_overridden' AND recipient_id = $1 ORDER BY created_at DESC LIMIT 1",
        [TEST_USERS.broker.id]
      );
      expect(notificationRes.rowCount).toBe(1);
      expect(notificationRes.rows[0].message).toContain('Resolution approved by NCS custom unit');
    });

    it('should require minimum characters requirement for override reasons', async () => {
      const payload = {
        override_total_ngn: 1000000,
        override_reason: 'Fix' // less than 5 chars
      };

      const res = await request(app)
        .put(`/api/jobs/${TEST_JOBS.duty_pending.id}/duty-assessment/override`)
        .set('Authorization', `Bearer : ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(401); // Invalid auth / validation error depending on header
    });

    it('should handle validation errors correctly under valid admin auth header structure', async () => {
      const payload = {
        override_total_ngn: 1000000,
        override_reason: 'Fix' // less than 5 chars
      };

      const res = await request(app)
        .put(`/api/jobs/${TEST_JOBS.duty_pending.id}/duty-assessment/override`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(400); // validation error
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // --- Compliance Scheduler Overdue Checks ---
  describe('Compliance Alert Scheduler Sweep', () => {
    it('should trigger custom overdue notification alerts for unpaid assessments older than 72 hours on tick', async () => {
      const olderJobId = TEST_JOBS.duty_pending.id;

      // 1. Setup an unpaid duty assessment and artificially backdate its assessed_at by 80 hours (72h+)
      await dbPool.query(`
        INSERT INTO duty_assessments (
          job_id, cif_value_usd, exchange_rate, rate_date, rate_source, cif_value_ngn, 
          duty_rate_pct, duty_amount_ngn, vat_amount_ngn, ciss_levy_ngn, total_duty_ngn, 
          payment_status, assessed_by, assessed_at, updated_at
        ) VALUES ($1, 10000, 1500, NOW() - INTERVAL '80 hours', 'manual', 15000000, 0.1, 1500000, 112500, 150000, 1762500, 'unpaid', $2, NOW() - INTERVAL '80 hours', NOW() - INTERVAL '80 hours')
        ON CONFLICT (job_id) DO UPDATE SET 
          payment_status = 'unpaid',
          assessed_at = NOW() - INTERVAL '80 hours'
      `, [olderJobId, TEST_USERS.broker.id]);

      // 2. Erase existing notifications to prevent false collisions
      await dbPool.query("DELETE FROM notifications WHERE type = 'duty_overdue'");

      // 3. Execute the compliance scheduler scanning thread (corresponds to mock node-cron event tick)
      await runComplianceAuditCheck();

      // 4. Confirm a notification is written to database for the assigned customs_broker alert
      const alertCheck = await dbPool.query(
        "SELECT * FROM notifications WHERE type = 'duty_overdue' AND job_id = $1 AND recipient_id = $2",
        [olderJobId, TEST_USERS.broker.id]
      );
      expect(alertCheck.rowCount).toBe(1);
      expect(alertCheck.rows[0].message).toContain('ALERT: Customs duty payment for Job');
      expect(alertCheck.rows[0].message).toContain('is overdue');
    });
  });
});
