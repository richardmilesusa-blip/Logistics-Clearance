import request from 'supertest';
import app from '../app-server.js';
import pg from 'pg';
import { TEST_USERS, TEST_CLIENTS, TEST_JOBS, getAuthToken } from './setup.js';

const { Pool } = pg;
const dbPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
  ssl: (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

describe('ClearPath Status Machine State Transition Validations', () => {
  const brokerToken = getAuthToken(TEST_USERS.broker);

  afterAll(async () => {
    await dbPool.end();
  });

  // 1. Transition: created -> docs_review
  describe('Transition: created -> docs_review', () => {
    it('should reject with 422 and require bl_record if B/L details missing', async () => {
      const jobId = TEST_JOBS.created.id;

      // Deleting bl_records for this job to force failure
      await dbPool.query('DELETE FROM bl_records WHERE job_id = $1', [jobId]);

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'docs_review' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Prerequisite failed: Bill of Lading (B/L) details row must exist inside bl_records.');
    });

    it('should accept with 200 when bl_record is restored and present', async () => {
      const jobId = TEST_JOBS.created.id;

      // Restore bl_record
      await dbPool.query(`
        INSERT INTO bl_records (job_id, requires_amendment, telex_status) 
        VALUES ($1, false, 'pending')
        ON CONFLICT (job_id) DO NOTHING
      `, [jobId]);

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'docs_review' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('docs_review');
    });
  });

  // 2. Transition: docs_review -> duty_pending
  describe('Transition: docs_review -> duty_pending', () => {
    it('should reject with 422 if no PAAR approved record is available', async () => {
      const jobId = TEST_JOBS.docs_review.id;

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'duty_pending' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Prerequisite failed: Pre-Arrival Assessment Report (PAAR) status must be approved.');
    });

    it('should accept with 200 when an approved PAAR record is associated with the job', async () => {
      const jobId = TEST_JOBS.docs_review.id;

      // Seed approved PAAR
      await dbPool.query(`
        INSERT INTO paar_records (job_id, fee_amount, status) 
        VALUES ($1, 75000, 'approved')
      `, [jobId]);

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'duty_pending' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('duty_pending');
    });
  });

  // 3. Transition: duty_pending -> tdo_issued
  describe('Transition: duty_pending -> tdo_issued', () => {
    it('should reject with 422 if customs duty is unpaid or absent', async () => {
      const jobId = TEST_JOBS.duty_pending.id;

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'tdo_issued' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Prerequisite failed: Customs duty assessment must be PAID before gate-out is allowed.');
    });

    it('should accept with 200 when customs duty is verified paid', async () => {
      const jobId = TEST_JOBS.duty_pending.id;

      // Seed paid duty assessment
      await dbPool.query(`
        INSERT INTO duty_assessments (
          job_id, cif_value_usd, exchange_rate, rate_date, rate_source, cif_value_ngn, 
          duty_rate_pct, duty_amount_ngn, vat_amount_ngn, ciss_levy_ngn, total_duty_ngn, 
          payment_status, assessed_by, assessed_at, updated_at
        ) VALUES ($1, 10000, 1500, NOW(), 'manual', 15000000, 0.1, 1500000, 112500, 150000, 1762500, 'paid', $2, NOW(), NOW())
        ON CONFLICT (job_id) DO UPDATE SET payment_status = 'paid'
      `, [jobId, TEST_USERS.broker.id]);

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'tdo_issued' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('tdo_issued');
    });
  });

  // 4. Transition: tdo_issued -> in_transit
  describe('Transition: tdo_issued -> in_transit', () => {
    const haulerId = '55555555-5555-5555-5555-555555555554';

    beforeAll(async () => {
      await dbPool.query(`
        INSERT INTO hauling_companies (id, name, is_approved) 
        VALUES ($1, 'Supreme Haulage Logistics', true)
        ON CONFLICT DO NOTHING
      `, [haulerId]);
    });

    it('should reject with 422 if no haulage order with status "assigned" exists', async () => {
      const jobId = TEST_JOBS.tdo_issued.id;

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'in_transit' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Prerequisite failed: An active haulage order with delivery_status = "assigned" must exist.');
    });

    it('should accept with 200 when active haulage transport is successfully assigned', async () => {
      const jobId = TEST_JOBS.tdo_issued.id;

      // Seed assigned haulage order
      await dbPool.query(`
        INSERT INTO haulage_orders (
          job_id, hauling_company_id, driver_name, driver_phone, truck_plate, 
          agreed_fee_ngn, delivery_destination, delivery_status
        ) VALUES ($1, $2, 'Umar Ibrahim', '+2348028731102', 'LAG-189-XA', 450000, 'Kano Outlet Center', 'assigned')
      `, [jobId, haulerId]);

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'in_transit' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('in_transit');
    });
  });

  // 5. Transition: in_transit -> delivered
  describe('Transition: in_transit -> delivered', () => {
    const haulerId = '55555555-5555-5555-5555-555555555554';

    beforeEach(async () => {
      const jobId = TEST_JOBS.in_transit.id;
      
      // Ensure hauling company is approved
      await dbPool.query(`
        INSERT INTO hauling_companies (id, name, is_approved) 
        VALUES ($1, 'Supreme Haulage Logistics', true)
        ON CONFLICT DO NOTHING
      `, [haulerId]);

      // Seed an active haulage order (assigned)
      await dbPool.query(`
        INSERT INTO haulage_orders (
          job_id, hauling_company_id, driver_name, driver_phone, truck_plate, 
          agreed_fee_ngn, delivery_destination, delivery_status
        ) VALUES ($1, $2, 'Umar Ibrahim', '+2348028731102', 'LAG-189-XA', 450000, 'Kano Outlet Center', 'assigned')
        ON CONFLICT DO NOTHING
      `, [jobId, haulerId]);
    });

    it('should reject with 422 if assigned haulage order shipping stays in status other than "delivered"', async () => {
      const jobId = TEST_JOBS.in_transit.id;

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'delivered' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Prerequisite failed: The assigned container haulage order must transition to "delivered" status.');
    });

    it('should accept with 200 when driver completes journey and order status transitions to "delivered"', async () => {
      const jobId = TEST_JOBS.in_transit.id;

      // Update haulage order status to 'delivered'
      await dbPool.query(`
        UPDATE haulage_orders 
        SET delivery_status = 'delivered' 
        WHERE job_id = $1
      `, [jobId]);

      const res = await request(app)
        .put(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ status: 'delivered' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('delivered');
    });
  });
});
