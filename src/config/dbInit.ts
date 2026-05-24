import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { query } from './database';

/**
 * Automatically initializes database schemas, child/remaining tables, and seeds default credentials.
 */
export async function dbInit(): Promise<void> {
  console.log('=== CLEARPATH DATABASE INITIALIZATION: START ===');
  try {
    // 1. Core Postgre SQL Extensions
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // 2. Base parent tables
    console.log('Bootstrapping base parent tables if missing...');
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('customs_broker', 'freight_forwarder', 'senior_admin', 'viewer')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
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
      );
    `);

    await query(`
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
      );
    `);

    await query(`
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
      );
    `);

    // 3. child_tables.sql
    console.log('Loading child tables schema and triggers...');
    const childTablesPath = path.resolve(process.cwd(), 'database/child_tables.sql');
    if (fs.existsSync(childTablesPath)) {
      const childTablesSql = fs.readFileSync(childTablesPath, 'utf8');
      await query(childTablesSql);
    } else {
      console.warn('Warning: child_tables.sql was not found in database directory.');
    }

    // 4. remaining_tables.sql
    console.log('Loading remaining tables schema and triggers...');
    const remainingTablesPath = path.resolve(process.cwd(), 'database/remaining_tables.sql');
    if (fs.existsSync(remainingTablesPath)) {
      const remainingTablesSql = fs.readFileSync(remainingTablesPath, 'utf8');
      await query(remainingTablesSql);
    } else {
      console.warn('Warning: remaining_tables.sql was not found in database directory.');
    }

    // 5. Seed default user accounts if user table is empty
    const userCount = await query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count, 10) === 0) {
      console.log('No user accounts detected. Seeding pre-seeded credentials for ClearPath platform...');
      const defaultPasswordHash = bcrypt.hashSync('password', 10);
      
      const seedUsers = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'broker@clearpath.com',
          password_hash: defaultPasswordHash,
          full_name: 'Customs Broker One',
          role: 'customs_broker',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'admin@clearpath.com',
          password_hash: defaultPasswordHash,
          full_name: 'Senior Administrator One',
          role: 'senior_admin',
        },
        {
          id: '55555555-5555-5555-5555-555555555555',
          email: 'forwarder@clearpath.com',
          password_hash: defaultPasswordHash,
          full_name: 'Freight Forwarder One',
          role: 'freight_forwarder',
        }
      ];

      for (const u of seedUsers) {
        await query(
          'INSERT INTO users (id, email, password_hash, full_name, role, is_active) VALUES ($1, $2, $3, $4, $5, true) ON CONFLICT DO NOTHING',
          [u.id, u.email, u.password_hash, u.full_name, u.role]
        );
      }
      console.log('Pre-seeded credentials seeded successfully.');
    } else {
      console.log('Users table already contains entries. Skipping pre-seed step.');
    }

    // 6. Ensure some clients exist as well so that creating a job doesn't error out on foreign key constraint
    const clientCount = await query('SELECT COUNT(*) FROM clients');
    if (parseInt(clientCount.rows[0].count, 10) === 0) {
      console.log('No clients detected. Adding default logistics clients...');
      await query(`
        INSERT INTO clients (id, name, type, tin, cac_reg_number, phone, email, address) VALUES
        ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Aliko Logistics Ltd', 'corporate', 'TIN-49202319', 'CAC-2938102', '+234 803 111 2222', 'logistics@aliko-group.com', '22 Alfred Rewane Road, Ikoyi, Lagos'),
        ('3d3aef61-da28-4ce6-99dd-62d2d85b1991', 'Mainland Commodities Hub', 'corporate', 'TIN-93821019', 'CAC-5291823', '+234 812 333 4444', 'imports@mainlandhub.com', 'Plot 15, Warehouse Wharf, Apapa, Lagos'),
        ('e6a86e5c-7f5b-4396-8576-96a928236d81', 'West African Agro Trades', 'individual', 'TIN-10293123', 'CAC-1923232', '+234 905 555 6666', 'trades@wa-agro.com', '10 Cocoa House Road, Ibadan, Oyo State')
        ON CONFLICT DO NOTHING
      `);
      console.log('Logistics clients loaded successfully.');
    }

    console.log('=== CLEARPATH DATABASE INITIALIZATION: SUCCESS ===');
  } catch (error) {
    console.error('CRITICAL ERROR: ClearPath Database initialization failed!', error);
  }
}
