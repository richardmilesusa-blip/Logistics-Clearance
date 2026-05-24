import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { query } from '../config/database';
import winston from 'winston';

const auditLoggerLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Audit Log Helper Function.
 * Safely writes a new record to the audit_logs database table without blocking the client.
 */
export async function auditLog(
  req: AuthenticatedRequest,
  action: string,
  entityType: string,
  entityId?: string | null,
  oldValue: any = null,
  newValue: any = null,
  jobId?: string | null
): Promise<void> {
  const userId = req.user?.id || null;
  const ipAddress = req.ip || req.socket.remoteAddress || null;

  // Run asynchronously without blocking primary execution thread
  query(
    `INSERT INTO audit_logs (
      job_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_value,
      new_value,
      ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      jobId || null,
      userId,
      action,
      entityType,
      entityId || null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress
    ]
  ).catch((err: any) => {
    // Gracefully handle audit storage errors by console logging with winston
    auditLoggerLogger.error('Failed to write record to database audit_logs table', {
      error: err.message,
      action,
      entityType,
      entityId
    });
  });
}
