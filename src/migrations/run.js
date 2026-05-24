/**
 * ClearPath Database Migration Runner Service
 * Executes plain .sql migrations sequentially (alphabetically) and records state
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

// Define directories
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/migrations/sql');

async function run() {
  console.log('=== CLEARPATH MIGRATION ENGINE: STARTING SWEEP ===');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('CRITICAL ERROR: DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  // Create isolated single client connection
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Successfully established database connection.');

    // 1. Core State Matrix Initialized: Create schema_migrations tracking registry
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Scan folders, ensure path exists safely
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log(`Migration script search path "${MIGRATIONS_DIR}" does not exist. Creating directories...`);
      fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    }

    // 3. Read SQL migration definitions and sort alphabetically
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Natural JS sorting handles alphabet & numbers like '001_xxx.sql', '002_xxx.sql'

    if (files.length === 0) {
      console.log('No SQL migration scripts found. System already synchronized.');
      return;
    }

    console.log(`Scan completed. Found ${files.length} migration files in ledger.`);

    // 4. Run migrations sequentially within transactions
    for (const file of files) {
      // Check if migration has already been executed
      const checkRes = await client.query(
        'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
        [file]
      );

      if (checkRes.rowCount > 0) {
        console.log(`[skipping] Migration "${file}" has already been applied.`);
        continue;
      }

      console.log(`[running] Applying migration: "${file}"...`);
      
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      // Execute within explicit query block
      await client.query('BEGIN');
      try {
        if (sqlContent.trim()) {
          await client.query(sqlContent);
        }
        
        // Register applied migration record
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file]
        );
        
        await client.query('COMMIT');
        console.log(`[success] Completed and committed migration: "${file}"`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[failure] Migration "${file}" encountered critical queries failure. Process aborted.`);
        console.error(err);
        process.exit(1);
      }
    }

    console.log('=== CLEARPATH MIGRATION ENGINE: ALL SCHEMAS UP TO DATE ===');
  } catch (error) {
    console.error('Fatal failure execution block on migrations thread:', error);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

// Check if run directly or imported (runs if executed directly via Node.js command line interfaces)
run();
