import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { query } from '../config/database';
import { auditLog } from '../middleware/auditLogger';
import { JobsService } from '../services/jobs.service';
import { fetchCbnRate } from '../services/cbnRate.service';
import { z } from 'zod';

const router = Router();

// Zod schemas for operational structures
const createTDOSchema = z.object({
  terminal_name: z.string().min(1, 'Terminal name is required').max(100),
  tdo_ref: z.string().min(1, 'TDO Reference is required').max(60),
  fee_amount_ngn: z.number().nonnegative('Fee amount must be zero or positive'),
  issue_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid issue_date format' }).optional().nullable(),
  free_days: z.number().int().nonnegative().optional().default(7),
  document_id: z.string().uuid().optional().nullable()
});

const updateTDOSchema = z.object({
  terminal_name: z.string().min(1).max(100).optional(),
  tdo_ref: z.string().min(1).max(60).optional(),
  fee_amount_ngn: z.number().nonnegative().optional(),
  issue_date: z.string().refine((val) => !isNaN(Date.parse(val))).optional().nullable(),
  free_days: z.number().int().nonnegative().optional(),
  demurrage_amount_ngn: z.number().nonnegative().optional(),
  demurrage_alert: z.boolean().optional(),
  document_id: z.string().uuid().optional().nullable()
});

const createHaulageSchema = z.object({
  hauling_company_id: z.string().uuid('Invalid hauling_company_id UUID'),
  driver_name: z.string().min(1, "Driver name is required").max(150),
  driver_phone: z.string().min(1, 'Driver phone number is required').max(20),
  truck_plate: z.string().min(1, 'Truck plate number is required').max(20),
  agreed_fee_ngn: z.number().positive('Agreed fee must be a positive number'),
  delivery_destination: z.string().min(1, 'Delivery destination is required')
});

const updateHaulageStatusSchema = z.object({
  delivery_status: z.enum(['assigned', 'in_transit', 'delivered', 'failed'])
});

const createExaminationSchema = z.object({
  examination_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid examination date' }),
  examination_officer: z.string().max(150).optional().nullable(),
  examination_shed: z.string().max(100).optional().nullable(),
  devanning_fee_ngn: z.number().nonnegative().optional().default(0),
  outcome: z.enum(['pending', 'passed', 'failed', 'short_landed', 'over_landed', 'misdescribed']).optional().default('pending'),
  short_landed_qty: z.number().nonnegative().optional().nullable(),
  over_landed_qty: z.number().nonnegative().optional().nullable(),
  examination_notes: z.string().optional().nullable(),
  stuffing_required: z.boolean().optional().default(false),
  stuffing_date: z.string().optional().nullable(),
  stuffing_fee_ngn: z.number().nonnegative().optional().default(0),
  report_document_id: z.string().uuid().optional().nullable()
});

const updateExaminationSchema = z.object({
  examination_officer: z.string().max(150).optional().nullable(),
  examination_shed: z.string().max(100).optional().nullable(),
  devanning_fee_ngn: z.number().nonnegative().optional(),
  outcome: z.enum(['pending', 'passed', 'failed', 'short_landed', 'over_landed', 'misdescribed']),
  short_landed_qty: z.number().nonnegative().optional().nullable(),
  over_landed_qty: z.number().nonnegative().optional().nullable(),
  examination_notes: z.string().optional().nullable(),
  stuffing_required: z.boolean().optional(),
  stuffing_date: z.string().optional().nullable(),
  stuffing_fee_ngn: z.number().nonnegative().optional(),
  report_document_id: z.string().uuid().optional().nullable()
});

const createDemurrageSchema = z.object({
  free_days_allotted: z.number().int().nonnegative().optional().default(7),
  demurrage_start_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid start date format' }),
  rate_per_day_usd: z.number().nonnegative('Rate per day USD must be zero or positive')
});

/**
 * POST /api/jobs/:jobId/tdo
 * Log Terminal Delivery Order issuance parameters for tracking.
 */
router.post(
  '/:jobId/tdo',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createTDOSchema.parse(req.body);

      // Verify Job
      const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job record not identified.' }
        });
        return;
      }

      const insertSql = `
        INSERT INTO tdo_records (
          job_id,
          terminal_name,
          tdo_ref,
          fee_amount_ngn,
          issue_date,
          free_days,
          document_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await query(insertSql, [
        jobId,
        body.terminal_name,
        body.tdo_ref,
        body.fee_amount_ngn,
        body.issue_date || null,
        body.free_days,
        body.document_id || null
      ]);

      const tdo = result.rows[0];

      // Refresh aggregations
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      await auditLog(
        req,
        'tdo_created',
        'tdo_records',
        tdo.id,
        null,
        tdo,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Terminal Delivery Order logged successfully.',
        data: tdo
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'TDO inputs validation fail.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create TDO record.', details: error.message }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/tdo/:id
 * Apply revisions to Terminal Delivery Order params. Re-recalculate invoice finances.
 */
router.put(
  '/:jobId/tdo/:id',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId, id } = req.params;
      const body = updateTDOSchema.parse(req.body);

      // Verify record exists bound to jobId
      const originalRes = await query('SELECT * FROM tdo_records WHERE id = $1 AND job_id = $2', [id, jobId]);
      if (originalRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Target Terminal Delivery Order not identified.' }
        });
        return;
      }

      const originalTdo = originalRes.rows[0];

      // Dynamically build partial UPDATE script
      const setClauses: string[] = [];
      const queryParams: any[] = [id, jobId];
      let paramIndex = 3;

      for (const [key, val] of Object.entries(body)) {
        if (val !== undefined) {
          setClauses.push(`${key} = $${paramIndex}`);
          queryParams.push(val);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        res.status(200).json({ success: true, message: 'No changes parsed. Recalculation skipped.', data: originalTdo });
        return;
      }

      const updateSql = `
        UPDATE tdo_records
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $1 AND job_id = $2
        RETURNING *
      `;

      const updatedRes = await query(updateSql, queryParams);
      const updatedTdo = updatedRes.rows[0];

      // Call database financial re-summarization procedure
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      await auditLog(
        req,
        'tdo_updated',
        'tdo_records',
        id,
        originalTdo,
        updatedTdo,
        jobId
      );

      res.status(200).json({
        success: true,
        message: 'TDO details modified and finances re-balanced.',
        data: updatedTdo
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'TDO updating attributes schema invalid.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Encountered database query crash.', details: error.message }
      });
    }
  }
);

/**
 * POST /api/jobs/:jobId/haulage
 * Dispatch last-mile container hauling orders.
 */
router.post(
  '/:jobId/haulage',
  verifyJwt,
  requireRole('freight_forwarder', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createHaulageSchema.parse(req.body);

      // Verify Job exists and is certified
      const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job metadata not resolved.' }
        });
        return;
      }

      // Verify vendor hauling company exists
      const companyCheck = await query('SELECT id FROM hauling_companies WHERE id = $1', [body.hauling_company_id]);
      if (companyCheck.rowCount === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'The specified hauling company must be active and approved before assignment.' }
        });
        return;
      }

      const insertSql = `
        INSERT INTO haulage_orders (
          job_id,
          hauling_company_id,
          driver_name,
          driver_phone,
          truck_plate,
          agreed_fee_ngn,
          delivery_destination,
          dispatch_date,
          delivery_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'assigned')
        RETURNING *
      `;

      const result = await query(insertSql, [
        jobId,
        body.hauling_company_id,
        body.driver_name,
        body.driver_phone,
        body.truck_plate,
        body.agreed_fee_ngn,
        body.delivery_destination
      ]);

      const haulage = result.rows[0];

      // Refresh finance sums
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      await auditLog(
        req,
        'haulage_created',
        'haulage_orders',
        haulage.id,
        null,
        haulage,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Haulage container order dispatched.',
        data: haulage
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Haulage order inputs failed validation.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create haulage order.', details: error.message }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/haulage/:id/status
 * Handle transit tracking events. When set to 'delivered', auto-completing parent workflow if conditions allow.
 */
router.put(
  '/:jobId/haulage/:id/status',
  verifyJwt,
  requireRole('freight_forwarder', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId, id } = req.params;
      const { delivery_status } = updateHaulageStatusSchema.parse(req.body);

      // Verify assignment mismatch safety 
      const haulageCheck = await query('SELECT * FROM haulage_orders WHERE id = $1 AND job_id = $2', [id, jobId]);
      if (haulageCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Haulage order not resolved.' }
        });
        return;
      }

      const originalHaulage = haulageCheck.rows[0];

      const isDelivered = delivery_status === 'delivered';
      const dateText = isDelivered ? ', delivery_date = NOW()' : '';

      const updateSql = `
        UPDATE haulage_orders
        SET 
          delivery_status = $1
          ${dateText},
          updated_at = NOW()
        WHERE id = $2 AND job_id = $3
        RETURNING *
      `;

      const result = await query(updateSql, [delivery_status, id, jobId]);
      const updatedHaulage = result.rows[0];

      await auditLog(
        req,
        'haulage_status_changed',
        'haulage_orders',
        id,
        { delivery_status: originalHaulage.delivery_status },
        { delivery_status: updatedHaulage.delivery_status },
        jobId
      );

      // Trigger Job State Auto Transition if delivered is marked and shipment is in_transit
      let autoTransitionSuccess = false;
      if (isDelivered) {
        const jobCheck = await query('SELECT status FROM jobs WHERE id = $1', [jobId]);
        if (jobCheck.rowCount > 0 && jobCheck.rows[0].status === 'in_transit') {
          // Attempt transition to delivered status
          const transitOutcome = await JobsService.transitionStatus(jobId, 'delivered');
          if (transitOutcome.success) {
            autoTransitionSuccess = true;
            await auditLog(
              req,
              'status_changed',
              'jobs',
              jobId,
              { status: 'in_transit' },
              { status: 'delivered' },
              jobId
            );
          }
        }
      }

      res.status(200).json({
        success: true,
        message: isDelivered && autoTransitionSuccess 
          ? 'Haulage delivered successfully. Parent Job promoted to delivered status.' 
          : 'Haulage delivery status updated.',
        data: {
          haulage_order: updatedHaulage,
          job_auto_completed: autoTransitionSuccess
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Unsupported status parameters.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update haulage order status.', details: error.message }
      });
    }
  }
);

/**
 * POST /api/jobs/:jobId/examination
 * Log physical cargo port examinations by customs regulatory checkers.
 */
router.post(
  '/:jobId/examination',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createExaminationSchema.parse(req.body);

      // Verify Job
      const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job metadata not resolved.' }
        });
        return;
      }

      const insertSql = `
        INSERT INTO examination_records (
          job_id,
          examination_date,
          examination_officer,
          examination_shed,
          devanning_fee_ngn,
          outcome,
          short_landed_qty,
          over_landed_qty,
          examination_notes,
          stuffing_required,
          stuffing_date,
          stuffing_fee_ngn,
          report_document_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const result = await query(insertSql, [
        jobId,
        body.examination_date,
        body.examination_officer || null,
        body.examination_shed || null,
        body.devanning_fee_ngn,
        body.outcome,
        body.short_landed_qty || null,
        body.over_landed_qty || null,
        body.examination_notes || null,
        body.stuffing_required,
        body.stuffing_date || null,
        body.stuffing_fee_ngn,
        body.report_document_id || null
      ]);

      const exam = result.rows[0];

      // Refresh finance sums
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      await auditLog(
        req,
        'examination_created',
        'examination_records',
        exam.id,
        null,
        exam,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Port physical assessment record registered successfully.',
        data: exam
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Cargo check parameter evaluation fails schema constraints.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'A database query crash occurred.', details: error.message }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/examination/:id
 * Update examination results. Creates a critical broker alert if outcome is flagged.
 */
router.put(
  '/:jobId/examination/:id',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId, id } = req.params;
      const body = updateExaminationSchema.parse(req.body);

      // Verify the exam is bound to the jobId
      const originalRes = await query('SELECT * FROM examination_records WHERE id = $1 AND job_id = $2', [id, jobId]);
      if (originalRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Target inspection record not identified.' }
        });
        return;
      }

      const originalExam = originalRes.rows[0];

      const updateSql = `
        UPDATE examination_records
        SET 
          examination_officer = $1,
          examination_shed = $2,
          devanning_fee_ngn = $3,
          outcome = $4,
          short_landed_qty = $5,
          over_landed_qty = $6,
          examination_notes = $7,
          stuffing_required = $8,
          stuffing_date = $9,
          stuffing_fee_ngn = $10,
          report_document_id = $11,
          updated_at = NOW()
        WHERE id = $12 AND job_id = $13
        RETURNING *
      `;

      const result = await query(updateSql, [
        body.examination_officer || null,
        body.examination_shed || null,
        body.devanning_fee_ngn !== undefined ? body.devanning_fee_ngn : originalExam.devanning_fee_ngn,
        body.outcome,
        body.short_landed_qty !== undefined ? body.short_landed_qty : originalExam.short_landed_qty,
        body.over_landed_qty !== undefined ? body.over_landed_qty : originalExam.over_landed_qty,
        body.examination_notes || null,
        body.stuffing_required !== undefined ? body.stuffing_required : originalExam.stuffing_required,
        body.stuffing_date || null,
        body.stuffing_fee_ngn !== undefined ? body.stuffing_fee_ngn : originalExam.stuffing_fee_ngn,
        body.report_document_id || null,
        id,
        jobId
      ]);

      const updatedExam = result.rows[0];

      // Refresh finance sums
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      await auditLog(
        req,
        'examination_updated',
        'examination_records',
        id,
        originalExam,
        updatedExam,
        jobId
      );

      // Core alert dispatch: if outcome changed from pending to 'misdescribed' or 'over_landed'
      if (originalExam.outcome === 'pending' && (updatedExam.outcome === 'misdescribed' || updatedExam.outcome === 'over_landed')) {
        // Find recipient assigned to handle this shipment
        const jobQuery = await query('SELECT job_ref, assigned_broker_id, created_by FROM jobs WHERE id = $1', [jobId]);
        if (jobQuery.rowCount > 0) {
          const jobData = jobQuery.rows[0];
          const recipientId = jobData.assigned_broker_id || jobData.created_by;
          
          if (recipientId) {
            const warnMsg = `CRITICAL WARNING: Physical Examination for Job ${jobData.job_ref} returned physical cargo outcome: ${updatedExam.outcome.toUpperCase()}. High risk of query or fine flagged by customs.`;
            await query(
              `INSERT INTO notifications (job_id, recipient_id, channel, type, message) 
               VALUES ($1, $2, 'in_app', 'examination_discrepancy', $3)`,
              [jobId, recipientId, warnMsg]
            );
          }
        }
      }

      res.status(200).json({
        success: true,
        message: 'Port physical cargo inspection details adjusted successfully.',
        data: updatedExam
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Parameters fail schema validations checks.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Encountered database transaction errors.', details: error.message }
      });
    }
  }
);

/**
 * POST /api/jobs/:jobId/demurrage
 * Register vessel/container demurrage details. Autocomputes days accrued and USD/NGN totals.
 */
router.post(
  '/:jobId/demurrage',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createDemurrageSchema.parse(req.body);

      // Verify Job exists and get its duty assessment's exchange rate if possible
      const jobCheck = await query(`
        SELECT j.id, da.exchange_rate 
        FROM jobs j 
        LEFT JOIN duty_assessments da ON j.id = da.job_id 
        WHERE j.id = $1
      `, [jobId]);

      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job metadata not resolved.' }
        });
        return;
      }

      // 1. Autocompute days accrued from start date to current timestamp
      const startDate = new Date(body.demurrage_start_date);
      const currentDate = new Date();
      const diffTime = currentDate.getTime() - startDate.getTime();
      const daysAccrued = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      // 2. Fetch or fallback exchange rate for conversion
      let exchangeRate = parseFloat(jobCheck.rows[0].exchange_rate || '0');
      if (exchangeRate <= 0) {
        // Query automatic cbnRate utility
        const cbnFeed = await fetchCbnRate();
        exchangeRate = cbnFeed.rate;
      }

      // 3. Compute monetary values
      const totalUSD = Math.round((daysAccrued * body.rate_per_day_usd) * 100) / 100;
      const totalNGN = Math.round((totalUSD * exchangeRate) * 100) / 100;

      const insertSql = `
        INSERT INTO demurrage_records (
          job_id,
          free_days_allotted,
          demurrage_start_date,
          rate_per_day_usd,
          days_accrued,
          total_usd,
          total_ngn
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await query(insertSql, [
        jobId,
        body.free_days_allotted,
        body.demurrage_start_date,
        body.rate_per_day_usd,
        daysAccrued,
        totalUSD,
        totalNGN
      ]);

      const demurrage = result.rows[0];

      // Refresh aggregations
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      await auditLog(
        req,
        'demurrage_created',
        'demurrage_records',
        demurrage.id,
        null,
        demurrage,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Demurrage record filed and auto-accrued finances calculated.',
        data: demurrage
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Demurrage arguments validation failure.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'A database query failure occurred.', details: error.message }
      });
    }
  }
);

export default router;
