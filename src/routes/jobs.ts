import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { auditLog } from '../middleware/auditLogger';
import { JobsService } from '../services/jobs.service';
import { createJobSchema, updateJobSchema, transitionStatusSchema } from '../validators/jobs.validator';

const router = Router();

/**
 * GET /api/jobs
 * Returns a paginated List of Job shipments.
 * Role access: Viewers/Admins see all, Brokers/Forwarders only see records where they are assigned.
 */
router.get('/', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      client_id: req.query.client_id as string,
      assigned_broker_id: req.query.assigned_broker_id as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    };

    const results = await JobsService.getJobs(filters, req.user!);
    
    res.status(200).json({
      success: true,
      data: results.jobs,
      meta: results.meta
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve jobs records.',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/jobs
 * Register a new shipment job.
 * Role access: customs_broker, freight_forwarder, senior_admin.
 */
router.post(
  '/',
  verifyJwt,
  requireRole('customs_broker', 'freight_forwarder', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate inputs with Zod
      const validatedData = createJobSchema.parse(req.body);

      const job = await JobsService.createJob(validatedData, req.user!.id);

      // Write security and compliance track
      await auditLog(
        req,
        'job_created',
        'jobs',
        job.id,
        null,
        job,
        job.id
      );

      res.status(201).json({
        success: true,
        message: 'Shipment job record initialized successfully.',
        data: job
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Inbound creation arguments failed verification',
            details: error.flatten().fieldErrors
          }
        });
        return;
      }

      if (error.code === '23505') {
        res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A duplicate Bill of Lading or unique constraint violation occurred.',
            details: error.message
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred during job registration.',
          details: error.message
        }
      });
    }
  }
);

/**
 * GET /api/jobs/:id
 * Retrieve aggregated, multi-table detailed record for a Job.
 * Role access: All authenticated users (broker/forwarder restrictions still apply).
 */
router.get('/:id', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const job = await JobsService.getJobById(id);

    if (!job) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Matching shipment job row not found.'
        }
      });
      return;
    }

    // Row-level permission guard
    if (
      req.user!.role === 'customs_broker' && job.assigned_broker_id !== req.user!.id ||
      req.user!.role === 'freight_forwarder' && job.assigned_forwarder_id !== req.user!.id
    ) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You are not assigned to perform actions on this shipment job.'
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve detailed job configuration.',
        details: error.message
      }
    });
  }
});

/**
 * PUT /api/jobs/:id
 * Partially edit non-status related job columns.
 * Role access: customs_broker, freight_forwarder, senior_admin.
 */
router.put(
  '/:id',
  verifyJwt,
  requireRole('customs_broker', 'freight_forwarder', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const validatedUpdates = updateJobSchema.parse(req.body);

      const updateResult = await JobsService.updateJob(id, validatedUpdates);

      if (!updateResult) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Target job record to update not identified.'
          }
        });
        return;
      }

      // Log only if real changes occurred
      if (Object.keys(updateResult.auditChange.newValue).length > 0) {
        await auditLog(
          req,
          'job_updated',
          'jobs',
          id,
          updateResult.auditChange.oldValue,
          updateResult.auditChange.newValue,
          id
        );
      }

      res.status(200).json({
        success: true,
        message: 'Shipment updates applied successfully.',
        data: updateResult.updatedJob
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Inbound updates arguments failed verification checks.',
            details: error.flatten().fieldErrors
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save job updates.',
          details: error.message
        }
      });
    }
  }
);

/**
 * PUT /api/jobs/:id/status
 * Handle workflow state migrations with heavy prerequisite clearance.
 * Role access: customs_broker, freight_forwarder, senior_admin.
 */
router.put(
  '/:id/status',
  verifyJwt,
  requireRole('customs_broker', 'freight_forwarder', 'senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status, cancellation_reason } = transitionStatusSchema.parse(req.body);

      // Senior Admin restriction check for cancelled flow
      if (status === 'cancelled' && req.user!.role !== 'senior_admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied. Only senior administrator accounts are certified to terminate / cancel shipments.'
          }
        });
        return;
      }

      const outcome = await JobsService.transitionStatus(id, status, cancellation_reason);

      if (!outcome.success) {
        res.status(outcome.code!).json({
          success: false,
          error: {
            code: 'WORKFLOW_RULE_VIOLATION',
            message: outcome.message
          }
        });
        return;
      }

      // Append state logs
      await auditLog(
        req,
        'status_changed',
        'jobs',
        id,
        { status: outcome.oldStatus },
        { status: outcome.newStatus },
        id
      );

      res.status(200).json({
        success: true,
        message: `Shipment flow migrated to ${status} stage correctly.`,
        data: outcome.job
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'State transition parameters schema failed.',
            details: error.flatten().fieldErrors
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected exception occurred during state machine transition.',
          details: error.message
        }
      });
    }
  }
);

/**
 * DELETE /api/jobs/:id
 * Termination / soft cancellation of a job.
 * Role access: senior_admin only.
 */
router.delete(
  '/:id',
  verifyJwt,
  requireRole('senior_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const outcome = await JobsService.transitionStatus(id, 'cancelled', 'System Soft Delete requested via administrative dashboard.');

      if (!outcome.success) {
        res.status(outcome.code!).json({
          success: false,
          error: {
            code: 'WORKFLOW_RULE_VIOLATION',
            message: outcome.message
          }
        });
        return;
      }

      await auditLog(
        req,
        'job_deleted',
        'jobs',
        id,
        { status: outcome.oldStatus },
        { status: 'cancelled' },
        id
      );

      res.status(200).json({
        success: true,
        message: 'The shipment job was terminated and marked as soft-cancelled successfully.',
        data: outcome.job
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process soft-delete cancellation request.',
          details: error.message
        }
      });
    }
  }
);

export default router;
