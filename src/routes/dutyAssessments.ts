import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { auditLog } from '../middleware/auditLogger';
import { query } from '../config/database';
import { calculateDuty } from '../services/dutyCalculator.service';
import { fetchCbnRate } from '../services/cbnRate.service';
import { z } from 'zod';

const router = Router();

const createAssessmentSchema = z.object({
  cif_value_usd: z.number().positive('CIF Value USD must be a positive number'),
  exchange_rate: z.number().positive('Exchange rate must be a positive number').optional().nullable(),
  duty_rate_pct: z.number().nonnegative('Duty rate percentage must be zero or positive').max(1, 'Duty rate percentage cannot exceed 100%'),
  etls_levy_ngn: z.number().nonnegative().optional().nullable(),
  sad_number: z.string().max(50).optional().nullable(),
  cpc_code: z.string().max(20).optional().nullable()
});

const registerPaymentSchema = z.object({
  payment_ref: z.string().min(1, 'Payment reference is required').max(100),
  payment_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid payment date format' }),
  amount_paid_ngn: z.number().positive('Amount paid must be greater than zero')
});

const overrideAssessmentSchema = z.object({
  override_total_ngn: z.number().positive('Override total must be a positive number'),
  override_reason: z.string().min(5, 'Minimum 5 characters requirement for override reasons')
});

/**
 * POST /api/jobs/:jobId/duty-assessment
 * Performs the official Customs Duty computation, inserts/updates duty_assessments.
 * Role access: customs_broker, senior_admin.
 */
router.post(
  '/:jobId/duty-assessment',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createAssessmentSchema.parse(req.body);

      // Verify parent job exists
      const jobCheck = await query('SELECT id, job_ref FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Target job record not identified.'
          }
        });
        return;
      }

      // Determine exchange rate & rate source
      let exchangeRate = body.exchange_rate;
      let rateSource: 'cbn_auto' | 'manual' = 'manual';
      let rateDate = new Date().toISOString().split('T')[0];

      if (!exchangeRate) {
        const cbnFeed = await fetchCbnRate();
        exchangeRate = cbnFeed.rate;
        rateSource = cbnFeed.source;
        rateDate = cbnFeed.rateDate;
      }

      // Calculate duty details
      const results = calculateDuty({
        cifValueUsd: body.cif_value_usd,
        exchangeRate: exchangeRate,
        dutyRatePct: body.duty_rate_pct,
        etlsLevyNgn: body.etls_levy_ngn || 0
      });

      // Insert or update duty_assessments entry
      const insertSql = `
        INSERT INTO duty_assessments (
          job_id,
          cif_value_usd,
          exchange_rate,
          rate_date,
          rate_source,
          cif_value_ngn,
          duty_rate_pct,
          duty_amount_ngn,
          vat_amount_ngn,
          ciss_levy_ngn,
          etls_levy_ngn,
          total_duty_ngn,
          payment_status,
          sad_number,
          cpc_code,
          assessed_by,
          assessed_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'unpaid', $13, $14, $15, NOW(), NOW())
        ON CONFLICT (job_id) DO UPDATE SET
          cif_value_usd = EXCLUDED.cif_value_usd,
          exchange_rate = EXCLUDED.exchange_rate,
          rate_date = EXCLUDED.rate_date,
          rate_source = EXCLUDED.rate_source,
          cif_value_ngn = EXCLUDED.cif_value_ngn,
          duty_rate_pct = EXCLUDED.duty_rate_pct,
          duty_amount_ngn = EXCLUDED.duty_amount_ngn,
          vat_amount_ngn = EXCLUDED.vat_amount_ngn,
          ciss_levy_ngn = EXCLUDED.ciss_levy_ngn,
          etls_levy_ngn = EXCLUDED.etls_levy_ngn,
          total_duty_ngn = EXCLUDED.total_duty_ngn,
          sad_number = EXCLUDED.sad_number,
          cpc_code = EXCLUDED.cpc_code,
          assessed_by = EXCLUDED.assessed_by,
          updated_at = NOW()
        RETURNING *
      `;

      const savedRes = await query(insertSql, [
        jobId,
        body.cif_value_usd,
        exchangeRate,
        rateDate,
        rateSource,
        results.cifValueNgn,
        body.duty_rate_pct,
        results.dutyAmountNgn,
        results.vatAmountNgn,
        results.cissLevyNgn,
        results.etlsLevyNgn,
        results.totalDutyNgn,
        body.sad_number || null,
        body.cpc_code || null,
        req.user!.id
      ]);

      const assessment = savedRes.rows[0];

      // Invoke DB function to update aggregated finances
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      // Write audit log
      await auditLog(
        req,
        'duty_assessed',
        'duty_assessments',
        assessment.id,
        null,
        assessment,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Customs Duty Assessment recorded successfully.',
        data: assessment
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Inbound evaluation parameters failed validation checking checks.',
            details: error.flatten().fieldErrors
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during customs duty calculation.',
          details: error.message
        }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/duty-assessment/payment
 * Register a collection payment against calculated/overridden duty.
 * Role access: customs_broker, senior_admin.
 */
router.put(
  '/:jobId/duty-assessment/payment',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = registerPaymentSchema.parse(req.body);

      // Confirm assessment exists
      const assessmentRes = await query(
        'SELECT id, total_duty_ngn, payment_status FROM duty_assessments WHERE job_id = $1',
        [jobId]
      );

      if (assessmentRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'No customs duty assessment exists for the specified job. Perform assessment first.'
          }
        });
        return;
      }

      const originalAssessment = assessmentRes.rows[0];
      const targetTotal = parseFloat(originalAssessment.total_duty_ngn);
      
      // Determine payment status based on amount paid vs total duty
      const paymentStatus = body.amount_paid_ngn >= targetTotal ? 'paid' : 'partial';

      const updateSql = `
        UPDATE duty_assessments
        SET 
          payment_ref = $1,
          payment_date = $2,
          payment_status = $3,
          updated_at = NOW()
        WHERE job_id = $4
        RETURNING *
      `;

      const updatedRes = await query(updateSql, [
        body.payment_ref,
        body.payment_date,
        paymentStatus,
        jobId
      ]);

      const updatedAssessment = updatedRes.rows[0];

      // Refresh aggregated details
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      // Audit log track
      await auditLog(
        req,
        'duty_payment_confirmed',
        'duty_assessments',
        updatedAssessment.id,
        { payment_status: originalAssessment.payment_status },
        { payment_status: updatedAssessment.payment_status, payment_ref: updatedAssessment.payment_ref },
        jobId
      );

      res.status(200).json({
        success: true,
        message: 'Customs Duty payment confirmation saved correctly.',
        data: updatedAssessment
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Payment tracking inputs schema mismatch.',
            details: error.flatten().fieldErrors
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not record duty payments.',
          details: error.message
        }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/duty-assessment/override
 * Override calculated custom totals with specific values.
 * Role access: senior_admin only.
 */
router.put(
  '/:jobId/duty-assessment/override',
  verifyJwt,
  requireRole('senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = overrideAssessmentSchema.parse(req.body);

      // Confirm job & assessment exist
      const assessmentCheck = await query(
        `SELECT j.id, j.job_ref, j.assigned_broker_id, j.created_by, da.id as da_id, da.total_duty_ngn 
         FROM jobs j
         JOIN duty_assessments da ON j.id = da.job_id
         WHERE j.id = $1`,
        [jobId]
      );

      if (assessmentCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Duty assessment to override not found.'
          }
        });
        return;
      }

      const info = assessmentCheck.rows[0];
      const originalTotal = parseFloat(info.total_duty_ngn);

      // Standard override UPDATE SQL statement
      const overrideSql = `
        UPDATE duty_assessments
        SET 
          total_duty_ngn = $1,
          is_overridden = true,
          override_reason = $2,
          overridden_by = $3,
          overridden_at = NOW(),
          updated_at = NOW()
        WHERE job_id = $4
        RETURNING *
      `;

      const updatedRes = await query(overrideSql, [
        body.override_total_ngn,
        body.override_reason,
        req.user!.id,
        jobId
      ]);

      const updatedAssessment = updatedRes.rows[0];

      // Recompute invoice aggregates
      await query('SELECT recalculate_fee_summary($1)', [jobId]);

      // Write Notification for assigned broker (fall back to created_by)
      const recipientId = info.assigned_broker_id || info.created_by;
      if (recipientId) {
        const notifMsg = `Customs Duty Assessment for Job ${info.job_ref} was manually overridden by Administrator. New Total: NGN ${body.override_total_ngn.toLocaleString()}. Reason: "${body.override_reason}"`;
        await query(
          `INSERT INTO notifications (job_id, recipient_id, channel, type, message) 
           VALUES ($1, $2, 'in_app', 'duty_overridden', $3)`,
          [jobId, recipientId, notifMsg]
        );
      }

      // Record Audit Logging entry
      await auditLog(
        req,
        'duty_override',
        'duty_assessments',
        info.da_id,
        { total_duty_ngn: originalTotal },
        { total_duty_ngn: body.override_total_ngn, override_reason: body.override_reason },
        jobId
      );

      res.status(200).json({
        success: true,
        message: 'Duty Assessment values overridden by administrator successfully.',
        data: updatedAssessment
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Override details fail validation constraints.',
            details: error.flatten().fieldErrors
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record duty override parameters.',
          details: error.message
        }
      });
    }
  }
);

export default router;
