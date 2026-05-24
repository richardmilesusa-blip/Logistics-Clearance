import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { query } from '../config/database';
import { auditLog } from '../middleware/auditLogger';
import { z } from 'zod';

const router = Router();

// Zod schema for Form M creation
const createFormMSchema = z.object({
  form_m_number: z.string().min(1, 'Form M Number is required').max(50),
  issuing_bank: z.string().min(1, 'Issuing Bank is required').max(100),
  issue_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid issue_date format' }),
  expiry_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid expiry_date format' }),
  status: z.enum(['open', 'expired', 'cancelled', 'fulfilled']).optional().default('open'),
  document_id: z.string().uuid('Invalid document_id UUID').optional().nullable()
});

// Zod schema for Form M update
const updateFormMSchema = z.object({
  status: z.enum(['open', 'expired', 'cancelled', 'fulfilled']),
  document_id: z.string().uuid('Invalid document_id UUID').optional().nullable()
});

// Zod schema for Regulatory Clearance creation
const createClearanceSchema = z.object({
  agency: z.enum(['SON', 'NAFDAC', 'NAQS', 'DPR', 'OTHER']),
  is_required: z.boolean().optional().default(true),
  certificate_no: z.string().max(100).optional().nullable(),
  expiry_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid expiry_date format' }).optional().nullable(),
  status: z.enum(['not_required', 'pending', 'in_progress', 'approved', 'rejected']).optional().default('pending'),
  document_id: z.string().uuid('Invalid document_id UUID').optional().nullable()
});

// Zod schema for Regulatory Clearance update
const updateClearanceSchema = z.object({
  status: z.enum(['not_required', 'pending', 'in_progress', 'approved', 'rejected']),
  clearance_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid clearance_date format' }).optional().nullable(),
  document_id: z.string().uuid('Invalid document_id UUID').optional().nullable()
});

/**
 * POST /api/jobs/:jobId/form-m
 * Registered Form M detailed specifications for current job processes.
 */
router.post(
  '/:jobId/form-m',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createFormMSchema.parse(req.body);

      // Verify job exists
      const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Job record not found.' }
        });
        return;
      }

      // If document_id is supplied, verify it exists and is bound to this job
      if (body.document_id) {
        const docCheck = await query('SELECT id FROM documents WHERE id = $1 AND job_id = $2', [body.document_id, jobId]);
        if (docCheck.rowCount === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Specified document_id is invalid or belongs to another job.' }
          });
          return;
        }
      }

      const insertSql = `
        INSERT INTO form_m_records (
          job_id,
          form_m_number,
          issuing_bank,
          issue_date,
          expiry_date,
          status,
          document_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await query(insertSql, [
        jobId,
        body.form_m_number,
        body.issuing_bank,
        body.issue_date,
        body.expiry_date,
        body.status,
        body.document_id || null
      ]);

      const formM = result.rows[0];

      await auditLog(
        req,
        'form_m_created',
        'form_m_records',
        formM.id,
        null,
        formM,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Form M layout created successfully.',
        data: formM
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Form M verification checks failed.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An database insert exception occurred.', details: error.message }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/form-m/:id
 * Apply status and document ID updates to an existing Form M record.
 */
router.put(
  '/:jobId/form-m/:id',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId, id } = req.params;
      const body = updateFormMSchema.parse(req.body);

      // Verify that this Form M is actually associated with the job
      const originalRes = await query('SELECT * FROM form_m_records WHERE id = $1 AND job_id = $2', [id, jobId]);
      if (originalRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No Form M record matched criteria.' }
        });
        return;
      }

      const originalFormM = originalRes.rows[0];

      if (body.document_id) {
        const docCheck = await query('SELECT id FROM documents WHERE id = $1 AND job_id = $2', [body.document_id, jobId]);
        if (docCheck.rowCount === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Associated file key document not found for this Job context.' }
          });
          return;
        }
      }

      const updateSql = `
        UPDATE form_m_records
        SET 
          status = $1,
          document_id = $2,
          updated_at = NOW()
        WHERE id = $3 AND job_id = $4
        RETURNING *
      `;

      const result = await query(updateSql, [
        body.status,
        body.document_id || null,
        id,
        jobId
      ]);

      const updatedFormM = result.rows[0];

      await auditLog(
        req,
        'form_m_updated',
        'form_m_records',
        id,
        originalFormM,
        updatedFormM,
        jobId
      );

      res.status(200).json({
        success: true,
        message: 'Form M updated successfully.',
        data: updatedFormM
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Form M update verification checks failed.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update compliance details.', details: error.message }
      });
    }
  }
);

/**
 * POST /api/jobs/:jobId/regulatory-clearances
 * Initiate single-agency regulatory compliance clearances.
 */
router.post(
  '/:jobId/regulatory-clearances',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId } = req.params;
      const body = createClearanceSchema.parse(req.body);

      // Verify job exists
      const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
      if (jobCheck.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Target Job record does not exist.' }
        });
        return;
      }

      if (body.document_id) {
        const docCheck = await query('SELECT id FROM documents WHERE id = $1 AND job_id = $2', [body.document_id, jobId]);
        if (docCheck.rowCount === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Assigned document file UUID is invalid or belongs elsewhere.' }
          });
          return;
        }
      }

      const insertSql = `
        INSERT INTO regulatory_clearances (
          job_id,
          agency,
          is_required,
          certificate_no,
          expiry_date,
          status,
          document_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await query(insertSql, [
        jobId,
        body.agency,
        body.is_required,
        body.certificate_no || null,
        body.expiry_date || null,
        body.status,
        body.document_id || null
      ]);

      const clearance = result.rows[0];

      await auditLog(
        req,
        'clearance_created',
        'regulatory_clearances',
        clearance.id,
        null,
        clearance,
        jobId
      );

      res.status(201).json({
        success: true,
        message: 'Agency regulatory clearance log registered successfully.',
        data: clearance
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Regulatory clearance inputs failed validation schema.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database insert execution failed.', details: error.message }
      });
    }
  }
);

/**
 * PUT /api/jobs/:jobId/regulatory-clearances/:id
 * Apply clearance results, upload regulatory approvals, and change clearance status.
 */
router.put(
  '/:jobId/regulatory-clearances/:id',
  verifyJwt,
  requireRole('customs_broker', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { jobId, id } = req.params;
      const body = updateClearanceSchema.parse(req.body);

      const originalRes = await query('SELECT * FROM regulatory_clearances WHERE id = $1 AND job_id = $2', [id, jobId]);
      if (originalRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Regulatory clearance record not identified.' }
        });
        return;
      }

      const originalClearance = originalRes.rows[0];

      if (body.document_id) {
        const docCheck = await query('SELECT id FROM documents WHERE id = $1 AND job_id = $2', [body.document_id, jobId]);
        if (docCheck.rowCount === 0) {
          res.status(400).json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Reference approval file document not found or invalid.' }
          });
          return;
        }
      }

      const updateSql = `
        UPDATE regulatory_clearances
        SET 
          status = $1,
          clearance_date = $2,
          document_id = $3,
          updated_at = NOW()
        WHERE id = $4 AND job_id = $5
        RETURNING *
      `;

      const result = await query(updateSql, [
        body.status,
        body.clearance_date || null,
        body.document_id || null,
        id,
        jobId
      ]);

      const updatedClearance = result.rows[0];

      await auditLog(
        req,
        'clearance_updated',
        'regulatory_clearances',
        id,
        originalClearance,
        updatedClearance,
        jobId
      );

      res.status(200).json({
        success: true,
        message: 'Regulatory Clearance record updated successfully.',
        data: updatedClearance
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Regulatory Clearance update failed verification.', details: error.flatten().fieldErrors }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Encountered database update query failure.', details: error.message }
      });
    }
  }
);

/**
 * GET /api/jobs/:jobId/compliance-summary
 * Aggregates all compliance elements on the specified job and returns a consolidated clearance state.
 * Returns: { form_m: {...}, clearances: [...], all_clear: boolean }
 * all_clear is only when:
 * 1. An active Form M exists and its status = 'fulfilled'
 * 2. Every single regulatory clearance row where is_required = true has status = 'approved'
 */
router.get('/:jobId/compliance-summary', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;

    // Verify job exists
    const jobCheck = await query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    if (jobCheck.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Shipment record not identified.' }
      });
      return;
    }

    // Fetch the Form M records (newest first)
    const formMRes = await query('SELECT * FROM form_m_records WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1', [jobId]);
    const formM = formMRes.rows[0] || null;

    // Fetch all agencies clearances
    const clearancesRes = await query('SELECT * FROM regulatory_clearances WHERE job_id = $1 ORDER BY agency ASC', [jobId]);
    const clearances = clearancesRes.rows;

    // Calculate consolidation status 'all_clear'
    let allClear = true;

    // A. Form M must exist and be 'fulfilled'
    if (!formM || formM.status !== 'fulfilled') {
      allClear = false;
    }

    // B. Every regulatory clearance marked as mandatory must evaluate as 'approved'
    for (const cl of clearances) {
      if (cl.is_required === true && cl.status !== 'approved') {
        allClear = false;
        break;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        form_m: formM,
        clearances,
        all_clear: allClear
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Could not fetch consolidated compliance reports.', details: error.message }
    });
  }
});

export default router;
