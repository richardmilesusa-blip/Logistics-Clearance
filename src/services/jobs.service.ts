import { query, pool } from '../config/database';
import { AuthenticatedUser } from '../middleware/auth';

export interface JobsQueryFilters {
  status?: string;
  client_id?: string;
  assigned_broker_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class JobsService {
  /**
   * Fetch a paginated list of jobs with filters, applying user-role security restrictions.
   */
  static async getJobs(filters: JobsQueryFilters, user: AuthenticatedUser) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Apply role-based access filtering
    // Viewer and Senior Admin see all; Broker/Forwarder only see assigned shipments
    if (user.role === 'customs_broker') {
      whereClauses.push(`j.assigned_broker_id = $${paramIndex}`);
      queryParams.push(user.id);
      paramIndex++;
    } else if (user.role === 'freight_forwarder') {
      whereClauses.push(`j.assigned_forwarder_id = $${paramIndex}`);
      queryParams.push(user.id);
      paramIndex++;
    }

    // Apply filter: status
    if (filters.status) {
      whereClauses.push(`j.status = $${paramIndex}`);
      queryParams.push(filters.status);
      paramIndex++;
    }

    // Apply filter: client_id
    if (filters.client_id) {
      whereClauses.push(`j.client_id = $${paramIndex}`);
      queryParams.push(filters.client_id);
      paramIndex++;
    }

    // Apply filter: assigned_broker_id
    if (filters.assigned_broker_id) {
      whereClauses.push(`j.assigned_broker_id = $${paramIndex}`);
      queryParams.push(filters.assigned_broker_id);
      paramIndex++;
    }

    // Apply filter: date range (received)
    if (filters.date_from) {
      whereClauses.push(`j.date_received >= $${paramIndex}`);
      queryParams.push(filters.date_from);
      paramIndex++;
    }
    if (filters.date_to) {
      whereClauses.push(`j.date_received <= $${paramIndex}`);
      queryParams.push(filters.date_to);
      paramIndex++;
    }

    // Apply filter: search (searches container_no, bl_number, job_ref)
    if (filters.search) {
      whereClauses.push(`(j.container_no ILIKE $${paramIndex} OR j.bl_number ILIKE $${paramIndex} OR j.job_ref ILIKE $${paramIndex})`);
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query for pagination meta
    const countSql = `
      SELECT COUNT(*) as total 
      FROM jobs j
      ${whereStr}
    `;
    const countResult = await query(countSql, queryParams);
    const totalCount = parseInt(countResult.rows[0].total, 10);

    // Main fetch SQL
    const fetchSql = `
      SELECT 
        j.id, 
        j.job_ref, 
        j.container_no, 
        j.bl_number, 
        j.shipping_line, 
        j.vessel_name, 
        j.voyage_no, 
        j.port_of_loading, 
        j.port_of_discharge, 
        j.status, 
        j.date_received, 
        j.date_completed, 
        j.eta_date, 
        j.actual_arrival_date,
        c.name as client_name,
        ub.full_name as assigned_broker_name,
        uf.full_name as assigned_forwarder_name,
        COALESCE(fs.grand_total_ngn, 0) as grand_total_ngn
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN users ub ON j.assigned_broker_id = ub.id
      LEFT JOIN users uf ON j.assigned_forwarder_id = uf.id
      LEFT JOIN fee_summaries fs ON j.id = fs.job_id
      ${whereStr}
      ORDER BY j.date_received DESC, j.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const fetchResult = await query(fetchSql, queryParams);

    return {
      jobs: fetchResult.rows,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Create a new job within a database transaction, auto-initializing children fee_summaries and bl_records.
   */
  static async createJob(data: any, createdByUserId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert job into database
      const insertJobSql = `
        INSERT INTO jobs (
          container_no,
          bl_number,
          shipping_line,
          vessel_name,
          voyage_no,
          port_of_loading,
          port_of_discharge,
          cargo_description,
          hs_code,
          gross_weight_kg,
          container_seal_no,
          client_id,
          assigned_broker_id,
          assigned_forwarder_id,
          notes,
          eta_date,
          actual_arrival_date,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `;

      const jobResult = await client.query(insertJobSql, [
        data.container_no,
        data.bl_number,
        data.shipping_line,
        data.vessel_name || null,
        data.voyage_no || null,
        data.port_of_loading || null,
        data.port_of_discharge,
        data.cargo_description,
        data.hs_code || null,
        data.gross_weight_kg || null,
        data.container_seal_no || null,
        data.client_id,
        data.assigned_broker_id || null,
        data.assigned_forwarder_id || null,
        data.notes || null,
        data.eta_date || null,
        data.actual_arrival_date || null,
        createdByUserId
      ]);

      const newJob = jobResult.rows[0];

      // 2. Insert blank fee_summaries row for the job
      const insertFeeSql = `
        INSERT INTO fee_summaries (job_id)
        VALUES ($1)
      `;
      await client.query(insertFeeSql, [newJob.id]);

      // 3. Insert blank bl_records row for the job
      const insertBlSql = `
        INSERT INTO bl_records (job_id, requires_amendment, telex_status)
        VALUES ($1, false, 'pending')
      `;
      await client.query(insertBlSql, [newJob.id]);

      await client.query('COMMIT');
      return newJob;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch complete, aggregated details for a job.
   */
  static async getJobById(jobId: string) {
    // A. Fetch core job row joined with client details
    const jobSql = `
      SELECT 
        j.*,
        c.name as client_name,
        c.tin as client_tin,
        c.type as client_type,
        ub.full_name as assigned_broker_name,
        uf.full_name as assigned_forwarder_name
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN users ub ON j.assigned_broker_id = ub.id
      LEFT JOIN users uf ON j.assigned_forwarder_id = uf.id
      WHERE j.id = $1
    `;
    const jobRes = await query(jobSql, [jobId]);
    if (jobRes.rowCount === 0) {
      return null;
    }
    const job = jobRes.rows[0];

    // B. Fetch bl_records (One-To-One)
    const blRes = await query('SELECT * FROM bl_records WHERE job_id = $1', [jobId]);
    const bl_record = blRes.rows[0] || null;

    // C. Fetch paar_records (One-To-Many / Aggregated logs)
    const paarRes = await query('SELECT * FROM paar_records WHERE job_id = $1 ORDER BY created_at DESC', [jobId]);
    const paar_records = paarRes.rows;

    // D. Fetch duty_assessments (One-To-One)
    const dutyRes = await query('SELECT * FROM duty_assessments WHERE job_id = $1', [jobId]);
    const duty_assessment = dutyRes.rows[0] || null;

    // E. Fetch fee_summaries (One-To-One)
    const feeRes = await query('SELECT * FROM fee_summaries WHERE job_id = $1', [jobId]);
    const fee_summary = feeRes.rows[0] || null;

    // F. Fetch tdo_records (One-To-Many)
    const tdoRes = await query('SELECT * FROM tdo_records WHERE job_id = $1 ORDER BY created_at DESC', [jobId]);
    const tdo_records = tdoRes.rows;

    // G. Fetch haulage_orders (One-To-Many)
    const haulageRes = await query(`
      SELECT ho.*, hc.name as hauling_company_name 
      FROM haulage_orders ho
      LEFT JOIN hauling_companies hc ON ho.hauling_company_id = hc.id
      WHERE ho.job_id = $1 
      ORDER BY ho.created_at DESC
    `, [jobId]);
    const haulage_orders = haulageRes.rows;

    // H. Fetch form_m_records (One-To-Many)
    const formMRes = await query('SELECT * FROM form_m_records WHERE job_id = $1 ORDER BY created_at DESC', [jobId]);
    const form_m_records = formMRes.rows;

    // I. Fetch regulatory_clearances (One-To-Many)
    const regRes = await query('SELECT * FROM regulatory_clearances WHERE job_id = $1 ORDER BY created_at DESC', [jobId]);
    const regulatory_clearances = regRes.rows;

    // J. Fetch examination_records
    const examRes = await query('SELECT * FROM examination_records WHERE job_id = $1 ORDER BY created_at DESC', [jobId]);
    const examination_records = examRes.rows;

    // K. Fetch unread notifications count
    const notifRes = await query('SELECT COUNT(*) as unread_count FROM notifications WHERE job_id = $1 AND is_read = false', [jobId]);
    const unread_notifications = parseInt(notifRes.rows[0].unread_count || '0', 10);

    return {
      ...job,
      bl_record,
      paar_records,
      duty_assessment,
      fee_summary,
      tdo_records,
      haulage_orders,
      form_m_records,
      regulatory_clearances,
      examination_records,
      unread_notifications
    };
  }

  /**
   * Performs partial edits to specific permissible columns, tracking old/new differences for audit logs.
   */
  static async updateJob(jobId: string, updates: any) {
    const fetchSql = `SELECT * FROM jobs WHERE id = $1`;
    const originalRes = await query(fetchSql, [jobId]);
    if (originalRes.rowCount === 0) {
      return null;
    }
    const originalJob = originalRes.rows[0];

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return originalJob;
    }

    const setClauses: string[] = [];
    const queryParams: any[] = [jobId];
    let paramIndex = 2;

    const auditOldValue: any = {};
    const auditNewValue: any = {};

    for (const key of fields) {
      if (originalJob[key] !== updates[key]) {
        setClauses.push(`${key} = $${paramIndex}`);
        queryParams.push(updates[key]);
        paramIndex++;
        
        auditOldValue[key] = originalJob[key];
        auditNewValue[key] = updates[key];
      }
    }

    if (setClauses.length === 0) {
      return originalJob;
    }

    const updateSql = `
      UPDATE jobs
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const updatedResult = await query(updateSql, queryParams);
    return {
      updatedJob: updatedResult.rows[0],
      auditChange: {
        oldValue: auditOldValue,
        newValue: auditNewValue
      }
    };
  }

  /**
   * strict state validator and workflow machine agent logic.
   */
  static async transitionStatus(jobId: string, targetStatus: string, cancellationReason?: string) {
    const job = await this.getJobById(jobId);
    if (!job) {
      return { success: false, code: 404, message: 'Job record not found.' };
    }

    const currentStatus = job.status;

    // Bypass gate restrictions for cancellation flow
    if (targetStatus === 'cancelled') {
      if (!cancellationReason) {
        return { success: false, code: 400, message: 'A termination note / reason is required to cancel a shipment.' };
      }
      const updateRes = await query(
        `UPDATE jobs SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), '\n[Cancellation Reason]: ', $2) WHERE id = $1 RETURNING *`,
        [jobId, cancellationReason]
      );
      return {
        success: true,
        job: updateRes.rows[0],
        oldStatus: currentStatus,
        newStatus: 'cancelled'
      };
    }

    // Identify standard valid transitions and clear prerequisites
    if (targetStatus === 'docs_review') {
      if (currentStatus !== 'created') {
        return { success: false, code: 422, message: `Invalid status transition sequence. Cannot transition from ${currentStatus} to docs_review.` };
      }
      
      // Prerequisite Check: `bl_records` must exist for this job
      if (!job.bl_record) {
        return { success: false, code: 422, message: 'Prerequisite failed: Bill of Lading (B/L) details row must exist inside bl_records.' };
      }
    }

    else if (targetStatus === 'duty_pending') {
      if (currentStatus !== 'docs_review') {
        return { success: false, code: 422, message: `Invalid status transition sequence. Cannot transition from ${currentStatus} to duty_pending.` };
      }

      // Prerequisite Check: Must have a matching APPROVED paar_records row
      const hasApprovedPaar = job.paar_records && job.paar_records.some((p: any) => p.status === 'approved');
      if (!hasApprovedPaar) {
        return { success: false, code: 422, message: 'Prerequisite failed: Pre-Arrival Assessment Report (PAAR) status must be approved.' };
      }
    }

    else if (targetStatus === 'tdo_issued') {
      if (currentStatus !== 'duty_pending') {
        return { success: false, code: 422, message: `Invalid status transition sequence. Cannot transition from ${currentStatus} to tdo_issued.` };
      }

      // Prerequisite Check: Must have a duty_assessments detail with payment_status = paid
      if (!job.duty_assessment || job.duty_assessment.payment_status !== 'paid') {
        return { success: false, code: 422, message: 'Prerequisite failed: Customs duty assessment must be PAID before gate-out is allowed.' };
      }
    }

    else if (targetStatus === 'in_transit') {
      if (currentStatus !== 'tdo_issued') {
        return { success: false, code: 422, message: `Invalid status transition sequence. Cannot transition from ${currentStatus} to in_transit.` };
      }

      // Prerequisite Check: haulage_orders row with status 'assigned' is required
      const hasAssignedHaulage = job.haulage_orders && job.haulage_orders.some((h: any) => h.delivery_status === 'assigned');
      if (!hasAssignedHaulage) {
        return { success: false, code: 422, message: 'Prerequisite failed: An active haulage order with delivery_status = "assigned" must exist.' };
      }
    }

    else if (targetStatus === 'delivered') {
      if (currentStatus !== 'in_transit') {
        return { success: false, code: 422, message: `Invalid status transition sequence. Cannot transition from ${currentStatus} to delivered.` };
      }

      // Prerequisite Check: haulage_orders status must be 'delivered'
      const hasDeliveredHaulage = job.haulage_orders && job.haulage_orders.some((h: any) => h.delivery_status === 'delivered');
      if (!hasDeliveredHaulage) {
        return { success: false, code: 422, message: 'Prerequisite failed: The assigned container haulage order must transition to "delivered" status.' };
      }
    } else {
      return { success: false, code: 422, message: `Unsupported target status: ${targetStatus}` };
    }

    // Sequence valid: Execute transition update safely
    const isCompletedText = targetStatus === 'delivered' ? ', date_completed = NOW()' : '';
    const updateSql = `
      UPDATE jobs
      SET status = $2 ${isCompletedText}
      WHERE id = $1
      RETURNING *
    `;
    const transitionResult = await query(updateSql, [jobId, targetStatus]);

    return {
      success: true,
      job: transitionResult.rows[0],
      oldStatus: currentStatus,
      newStatus: targetStatus
    };
  }
}
