import pg from 'pg';
import winston from 'winston';

const { Pool } = pg;

// Define a simple logger for database query logging
const dbLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  dbLogger.warn('DATABASE_URL environment variable is not defined. PostgreSQL connection pool will fail on query execution.');
}

// Create pg connection Pool
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl && databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Catch pool error events to prevent application crashes
pool.on('error', (err) => {
  dbLogger.error('Unexpected error on idle PostgreSQL client pool', { error: err.message });
});

/**
 * Executes a PostgreSQL query with performance tracking.
 * Logs query text, duration, and flags queries taking longer than 500ms as slow queries.
 */
export async function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (> 500ms)
    if (duration > 500) {
      dbLogger.warn('Slow database query detected', {
        text,
        durationMs: duration,
        rowCount: res.rowCount
      });
    } else {
      dbLogger.info('Executed query successfully', {
        text,
        durationMs: duration,
        rowCount: res.rowCount
      });
    }
    
    return res;
  } catch (error: any) {
    const duration = Date.now() - start;
    dbLogger.error('Database query execution failed', {
      text,
      durationMs: duration,
      error: error.message
    });
    throw error;
  }
}
