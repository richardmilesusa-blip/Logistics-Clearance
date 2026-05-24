import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyJwt } from '../middleware/auth';
import { query } from '../config/database';

const router = Router();

// Ensure the client table and schema are present and complete
async function ensureClientsTable() {
  try {
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'clients'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      await query(`
        CREATE TABLE clients (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) DEFAULT 'corporate',
          tin VARCHAR(50),
          cac_reg_number VARCHAR(50),
          phone VARCHAR(50),
          email VARCHAR(255),
          address TEXT,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      
      // Inject dummy seeds if empty
      await query(`
        INSERT INTO clients (id, name, type, tin, cac_reg_number, phone, email, address) VALUES
        ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Aliko Logistics Ltd', 'corporate', 'TIN-49202319', 'CAC-2938102', '+234 803 111 2222', 'logistics@aliko-group.com', '22 Alfred Rewane Road, Ikoyi, Lagos'),
        ('3d3aef61-da28-4ce6-99dd-62d2d85b1991', 'Mainland Commodities Hub', 'corporate', 'TIN-93821019', 'CAC-5291823', '+234 812 333 4444', 'imports@mainlandhub.com', 'Plot 15, Warehouse Wharf, Apapa, Lagos'),
        ('e6a86e5c-7f5b-4396-8576-96a928236d81', 'West African Agro Trades', 'individual', 'TIN-10293123', 'CAC-1923232', '+234 905 555 6666', 'trades@wa-agro.com', '10 Cocoa House Road, Ibadan, Oyo State')
        ON CONFLICT DO NOTHING
      `);
    } else {
      const columns = [
        { name: 'type', type: 'VARCHAR(50) DEFAULT \'corporate\'' },
        { name: 'tin', type: 'VARCHAR(50)' },
        { name: 'cac_reg_number', type: 'VARCHAR(50)' },
        { name: 'phone', type: 'VARCHAR(50)' },
        { name: 'email', type: 'VARCHAR(255)' },
        { name: 'address', type: 'TEXT' },
        { name: 'status', type: 'VARCHAR(50) DEFAULT \'active\'' },
        { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
      ];
      
      for (const col of columns) {
        const colCheck = await query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'clients' 
            AND column_name = $1
          )
        `, [col.name]);
        
        if (!colCheck.rows[0].exists) {
          await query(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }
  } catch (err) {
    console.error('[ensureClientsTable failed]:', err);
  }
}

ensureClientsTable();

/**
 * GET /api/clients
 * Returns a table of clients with active job counts.
 */
router.get('/', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const listSql = `
      SELECT 
        c.id, c.name, c.email, c.phone, c.address, c.status, c.tin, c.cac_reg_number, c.type, c.created_at,
        COALESCE(count(j.id) filter (where j.status not in ('delivered', 'cancelled')), 0)::integer as active_job_count
      FROM clients c
      LEFT JOIN jobs j ON c.id = j.client_id
      GROUP BY c.id, c.name, c.email, c.phone, c.address, c.status, c.tin, c.cac_reg_number, c.type, c.created_at
      ORDER BY c.name ASC
    `;
    
    const result = await query(listSql);
    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not fetch clients list.',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/clients
 * Creates a new client.
 */
router.post('/', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, type, tin, cac_reg_number, phone, email, address } = req.body;
    
    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Client name is required.' }
      });
      return;
    }

    const insertSql = `
      INSERT INTO clients (name, type, tin, cac_reg_number, phone, email, address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await query(insertSql, [
      name,
      type || 'corporate',
      tin || null,
      cac_reg_number || null,
      phone || null,
      email || null,
      address || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Client created successfully.',
      data: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not create client.',
        details: error.message
      }
    });
  }
});

/**
 * PUT /api/clients/:id
 * Updates an existing client.
 */
router.put('/:id', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, tin, cac_reg_number, phone, email, address, status } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Client name is required.' }
      });
      return;
    }

    const updateSql = `
      UPDATE clients
      SET name = $1, type = $2, tin = $3, cac_reg_number = $4, phone = $5, email = $6, address = $7, status = $8
      WHERE id = $9
      RETURNING *
    `;
    
    const result = await query(updateSql, [
      name,
      type,
      tin,
      cac_reg_number,
      phone,
      email,
      address,
      status || 'active',
      id
    ]);

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Client not found.' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Client updated successfully.',
      data: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not update client.',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/clients/:id/jobs
 * Retrieves jobs associated with the client.
 */
router.get('/:id/jobs', verifyJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const jobsSql = `
      SELECT id, job_ref, container_no, status, date_received, created_at
      FROM jobs
      WHERE client_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const result = await query(jobsSql, [id]);
    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not retrieve client jobs list.',
        details: error.message
      }
    });
  }
});

export default router;
