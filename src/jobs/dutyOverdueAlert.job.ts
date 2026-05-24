import cron from 'node-cron';
import winston from 'winston';
import { query } from '../config/database';

const jobLogger = winston.createLogger({
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
 * Validates user existence and status, returns senior admin default on inactive/missing brokers.
 */
async function getEffectiveRecipient(assignedBrokerId: string | null, jobCreatorId: string): Promise<string> {
  // 1. If we have a broker, check if they are active
  if (assignedBrokerId) {
    const brokerRes = await query('SELECT id, is_active FROM users WHERE id = $1', [assignedBrokerId]);
    if (brokerRes.rowCount > 0 && brokerRes.rows[0].is_active === true) {
      return assignedBrokerId;
    }
  }

  // 2. Fallback to job creator if active
  const creatorRes = await query('SELECT id, is_active FROM users WHERE id = $1', [jobCreatorId]);
  if (creatorRes.rowCount > 0 && creatorRes.rows[0].is_active === true) {
    return jobCreatorId;
  }

  // 3. Last fallback: Retrieve first active senior admin
  const adminRes = await query(`SELECT id FROM users WHERE role = 'senior_admin' AND is_active = true LIMIT 1`);
  if (adminRes.rowCount > 0) {
    return adminRes.rows[0].id;
  }

  // Absolute safety net (if no users match, return original creator anyway or any user id)
  return assignedBrokerId || jobCreatorId;
}

/**
 * Sweeps the database for overdue duties and expiring Form M entries.
 * Fires local UI/In-App notifications for matching records if not yet created today.
 */
export async function runComplianceAuditCheck(): Promise<void> {
  jobLogger.info('Scanning for overdue duties and critical Form M expiries...');

  try {
    // SECTION A: Overdue Customs Duties Check
    const unpaidAssessments = await query(`
      SELECT 
        da.id as assessment_id, 
        da.job_id, 
        da.assessed_at, 
        j.job_ref, 
        j.assigned_broker_id, 
        j.created_by
      FROM duty_assessments da
      JOIN jobs j ON da.job_id = j.id
      WHERE da.payment_status = 'unpaid'
        AND da.assessed_at < NOW() - INTERVAL '72 hours'
        AND j.status != 'cancelled'
    `);

    jobLogger.info(`Found ${unpaidAssessments.rowCount} unpaid customs assessments older than 72 hours.`);

    for (const row of unpaidAssessments.rows) {
      // Check if notification already issued today
      const alreadySent = await query(`
        SELECT COUNT(*) as count 
        FROM notifications 
        WHERE job_id = $1 
          AND type = 'duty_overdue' 
          AND created_at >= CURRENT_DATE
      `, [row.job_id]);

      const sentCount = parseInt(alreadySent.rows[0].count || '0', 10);
      if (sentCount === 0) {
        const recipient = await getEffectiveRecipient(row.assigned_broker_id, row.created_by);
        const notifyMsg = `ALERT: Customs duty payment for Job ${row.job_ref} is overdue (exceeded 72 hrs post-assessment). Attention requested.`;
        
        await query(`
          INSERT INTO notifications (job_id, recipient_id, channel, type, message, sent_at)
          VALUES ($1, $2, 'in_app', 'duty_overdue', $3, NOW())
        `, [row.job_id, recipient, notifyMsg]);

        jobLogger.info(`Delivered duty_overdue notification for jobId: ${row.job_id}`);
      }
    }

    // SECTION B: Form M Expiry Alerts Check
    const expiringFormMs = await query(`
      SELECT 
        fm.id as form_m_id, 
        fm.job_id, 
        fm.form_m_number, 
        fm.expiry_date, 
        j.job_ref, 
        j.assigned_broker_id, 
        j.created_by
      FROM form_m_records fm
      JOIN jobs j ON fm.job_id = j.id
      WHERE fm.status = 'open'
        AND fm.expiry_date < NOW() + INTERVAL '14 days'
        AND j.status != 'cancelled'
    `);

    jobLogger.info(`Found ${expiringFormMs.rowCount} active Form M records expiring within 14 days.`);

    for (const row of expiringFormMs.rows) {
      // Check if notification already issued today
      const alreadySent = await query(`
        SELECT COUNT(*) as count 
        FROM notifications 
        WHERE job_id = $1 
          AND type = 'form_m_expiry_alert' 
          AND created_at >= CURRENT_DATE
      `, [row.job_id]);

      const sentCount = parseInt(alreadySent.rows[0].count || '0', 10);
      if (sentCount === 0) {
        const recipient = await getEffectiveRecipient(row.assigned_broker_id, row.created_by);
        const formattedDate = new Date(row.expiry_date).toDateString();
        const notifyMsg = `CRITICAL ALERT: Form M ${row.form_m_number} linked to Job ${row.job_ref} will expire on ${formattedDate}. Action required within 14 days.`;

        await query(`
          INSERT INTO notifications (job_id, recipient_id, channel, type, message, sent_at)
          VALUES ($1, $2, 'in_app', 'form_m_expiry_alert', $3, NOW())
        `, [row.job_id, recipient, notifyMsg]);

        jobLogger.info(`Delivered form_m_expiry_alert notification for jobId: ${row.job_id}`);
      }
    }

    jobLogger.info('Compliance audit checks finished correctly.');
  } catch (err: any) {
    jobLogger.error('Scheduled compliance checking job encountered database execution errors.', {
      error: err.message
    });
  }
}

/**
 * Registers and loads the cron scheduler on application startup.
 * Scheduled to run every hour: "0 * * * *"
 */
export function initializeScheduledJobs(): void {
  jobLogger.info('Loading and starting background node-cron compliance alerts...');
  cron.schedule('0 * * * *', async () => {
    jobLogger.info('Cron trigger: Starting hourly compliance checks run...');
    await runComplianceAuditCheck();
  });
}
