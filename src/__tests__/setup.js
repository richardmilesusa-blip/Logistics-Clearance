import fs from 'fs';
import path from 'path';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

// Use TEST_DATABASE_URL or fallback to DATABASE_URL
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/clearpath_test';
process.env.DATABASE_URL = testDbUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-123456';

const pool = new Pool({
  connectionString: testDbUrl,
  ssl: testDbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Seed static UUID targets for safe reference in tests
export const TEST_USERS = {
  broker: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'broker@clearpath.com',
    password_hash: '$2a$10$Un0m94C4vL/oK75Apy6fW.7cAtZ27lI9mE4C3K0SjZtw1kSwrT8g2', // bcrypt hash for 'password'
    full_name: 'Customs Broker One',
    role: 'customs_broker',
    is_active: true
  },
  admin: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'admin@clearpath.com',
    password_hash: '$2a$10$Un0m94C4vL/oK75Apy6fW.7cAtZ27lI9mE4C3K0SjZtw1kSwrT8g2', // bcrypt hash for 'password'
    full_name: 'Senior Administrator One',
    role: 'senior_admin',
    is_active: true
  }
};

export const TEST_CLIENTS = {
  client1: {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Test Client A',
    type: 'corporate',
    tin: 'TIN-111111',
    cac_reg_number: 'CAC-111111',
    phone: '+2348000000001',
    email: 'clientA@test.com',
    address: '123 Test Boulevard, Lagos'
  },
  client2: {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Test Client B',
    type: 'individual',
    tin: 'TIN-222222',
    cac_reg_number: 'CAC-222222',
    phone: '+2348000000002',
    email: 'clientB@test.com',
    address: '456 Test Boulevard, Lagos'
  }
};

export const TEST_JOBS = {
  created: { id: 'a1111111-1111-1111-1111-111111111111', status: 'created', bl_number: 'BL-CREATED' },
  docs_review: { id: 'a2222222-2222-2222-2222-222222222222', status: 'docs_review', bl_number: 'BL-DOCS-REVIEW' },
  duty_pending: { id: 'a3333333-3333-3333-3333-333333333333', status: 'duty_pending', bl_number: 'BL-DUTY-PENDING' },
  tdo_issued: { id: 'a4444444-4444-4444-4444-444444444444', status: 'tdo_issued', bl_number: 'BL-TDO-ISSUED' },
  in_transit: { id: 'a5555555-5555-5555-5555-555555555555', status: 'in_transit', bl_number: 'BL-IN-TRANSIT' },
  delivered: { id: 'a6666666-6666-6666-6666-666666666666', status: 'delivered', bl_number: 'BL-DELIVERED' },
  cancelled: { id: 'a7777777-7777-7777-7777-777777777777', status: 'cancelled', bl_number: 'BL-CANCELLED' }
};

export function getAuthToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET);
}

// Global beforeAll runs migrations
beforeAll(async () => {
  const client = await pool.connect();
  try {
    // 1. Enable standard extensions
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // 2. Build parent tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('customs_broker', 'freight_forwarder', 'senior_admin', 'viewer')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_ref VARCHAR(50) UNIQUE DEFAULT 'REF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6),
        container_no VARCHAR(20) NOT NULL,
        bl_number VARCHAR(50) UNIQUE NOT NULL,
        shipping_line VARCHAR(100) NOT NULL,
        vessel_name VARCHAR(100),
        voyage_no VARCHAR(30),
        port_of_loading VARCHAR(100),
        port_of_discharge VARCHAR(100) NOT NULL,
        cargo_description TEXT NOT NULL,
        hs_code VARCHAR(20),
        gross_weight_kg NUMERIC(12,3),
        container_seal_no VARCHAR(50),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        assigned_broker_id UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_forwarder_id UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        eta_date TIMESTAMPTZ,
        actual_arrival_date TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'docs_review', 'duty_pending', 'tdo_issued', 'in_transit', 'delivered', 'cancelled')),
        date_received TIMESTAMPTZ DEFAULT NOW(),
        date_completed TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID,
        user_id UUID,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100),
        old_value TEXT,
        new_value TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 3. Load child_tables schemas from sql file
    const childTablesPath = path.resolve(process.cwd(), 'database/child_tables.sql');
    const childTablesSql = fs.readFileSync(childTablesPath, 'utf8');
    await client.query(childTablesSql);

    // 4. Load remaining_tables schemas from sql file
    const remainingTablesPath = path.resolve(process.cwd(), 'database/remaining_tables.sql');
    const remainingTablesSql = fs.readFileSync(remainingTablesPath, 'utf8');
    await client.query(remainingTablesSql);

    console.log('--- TEST SYSTEM: Database schemas and triggers loaded successfully ---');
  } catch (err) {
    console.error('--- TEST SYSTEM CONFIGUATION FAILURE: ---', err);
    throw err;
  } finally {
    client.release();
  }
});

// Global beforeEach resets tables and seeds fixtures
beforeEach(async () => {
  const client = await pool.connect();
  try {
    // 1. Truncate all tables recursively
    await client.query(`
      TRUNCATE TABLE 
        audit_logs, 
        notifications, 
        client_invoices, 
        demurrage_records, 
        examination_records, 
        regulatory_clearances, 
        form_m_records, 
        haulage_orders, 
        hauling_companies, 
        tdo_records, 
        fee_summaries, 
        duty_assessments, 
        paar_records, 
        bl_records, 
        documents, 
        jobs, 
        clients, 
        users 
      CASCADE
    `);

    // 2. Insert user fixtures
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, role, is_active) VALUES
      ($1, $2, $3, $4, $5, $6),
      ($7, $8, $9, $10, $11, $12)
    `, [
      TEST_USERS.broker.id, TEST_USERS.broker.email, TEST_USERS.broker.password_hash, TEST_USERS.broker.full_name, TEST_USERS.broker.role, TEST_USERS.broker.is_active,
      TEST_USERS.admin.id, TEST_USERS.admin.email, TEST_USERS.admin.password_hash, TEST_USERS.admin.full_name, TEST_USERS.admin.role, TEST_USERS.admin.is_active
    ]);

    // 3. Insert client fixtures
    await client.query(`
      INSERT INTO clients (id, name, type, tin, cac_reg_number, phone, email, address) VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8),
      ($9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      TEST_CLIENTS.client1.id, TEST_CLIENTS.client1.name, TEST_CLIENTS.client1.type, TEST_CLIENTS.client1.tin, TEST_CLIENTS.client1.cac_reg_number, TEST_CLIENTS.client1.phone, TEST_CLIENTS.client1.email, TEST_CLIENTS.client1.address,
      TEST_CLIENTS.client2.id, TEST_CLIENTS.client2.name, TEST_CLIENTS.client2.type, TEST_CLIENTS.client2.tin, TEST_CLIENTS.client2.cac_reg_number, TEST_CLIENTS.client2.phone, TEST_CLIENTS.client2.email, TEST_CLIENTS.client2.address
    ]);

    // 4. Seeding 7 individual jobs to represent all pipeline stages
    const statuses = ['created', 'docs_review', 'duty_pending', 'tdo_issued', 'in_transit', 'delivered', 'cancelled'];
    for (const status of statuses) {
      const jobFixture = Object.values(TEST_JOBS).find((j) => j.status === status);
      await client.query(`
        INSERT INTO jobs (
          id, 
          container_no, 
          bl_number, 
          shipping_line, 
          port_of_discharge, 
          cargo_description, 
          client_id, 
          assigned_broker_id, 
          status, 
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        jobFixture.id,
        `CONT-100-${status.toUpperCase()}`,
        jobFixture.bl_number,
        'MAERSK LINE',
        'APAPA PORT',
        `Standard cargo description for status: ${status}`,
        TEST_CLIENTS.client1.id,
        TEST_USERS.broker.id,
        status,
        TEST_USERS.admin.id
      ]);

      // Seed core support tables for the active status to keep financial and log integrity
      await client.query('INSERT INTO fee_summaries (job_id) VALUES ($1) ON CONFLICT DO NOTHING', [jobFixture.id]);
      await client.query(`
        INSERT INTO bl_records (job_id, requires_amendment, telex_status) 
        VALUES ($1, false, 'pending') 
        ON CONFLICT DO NOTHING
      `, [jobFixture.id]);
    }
  } catch (err) {
    console.error('--- SEEDING OF TEST FIXTURES FAILURE: ---', err);
    throw err;
  } finally {
    client.release();
  }
});

// Tear-down after all run
afterAll(async () => {
  await pool.end();
});
