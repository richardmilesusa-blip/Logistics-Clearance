import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

/**
 * GET /api/notifications
 * Retrieves unread notifications for the authenticated user, ordered by newest first.
 * Restricted to page capacity of 50.
 */
router.get('/', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const listSql = `
      SELECT 
        id,
        job_id,
        recipient_id,
        channel,
        type,
        message,
        is_read,
        sent_at,
        created_at
      FROM notifications
      WHERE recipient_id = $1 AND is_read = false
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await query(listSql, [userId]);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve notifications.',
        details: error.message
      }
    });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a specific notification as read.
 */
router.put('/:id/read', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const updateSql = `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND recipient_id = $2
      RETURNING *
    `;

    const result = await query(updateSql, [id, userId]);

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Notification not found or access denied.'
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read successfully.',
      data: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not update notification status.',
        details: error.message
      }
    });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the current user.
 */
router.put('/read-all', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const updateSql = `
      UPDATE notifications
      SET is_read = true
      WHERE recipient_id = $1 AND is_read = false
    `;

    await query(updateSql, [userId]);

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read successfully.'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not process read-all update request.',
        details: error.message
      }
    });
  }
});

export default router;
