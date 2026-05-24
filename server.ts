import app from './src/app-server';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import winston from 'winston';
import { initializeScheduledJobs } from './src/jobs/dutyOverdueAlert.job';

const serverLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

async function startServer() {
  const PORT = 3000;

  // Boot standard database schema initializing/seeding rules
  try {
    const { dbInit } = await import('./src/config/dbInit');
    await dbInit();
  } catch (dbError: any) {
    serverLogger.error('Failed database pre-flight bootstrap sequence', { error: dbError.message });
  }

  // Initialize and start standard hourly Node-Cron alert engines
  initializeScheduledJobs();

  // Integrate Vite for development or serve custom build static output in production
  if (process.env.NODE_ENV !== 'production') {
    serverLogger.info('Initializing Vite dev server middleware integration for ClearPath full-stack preview...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    // Use Vite middleware as fallback for UI views
    app.use(vite.middlewares);
  } else {
    serverLogger.info('Production mode identified. Serving compiled static front-end assets...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    serverLogger.info(`ClearPath Express server successfully listening on http://0.0.0.0:${PORT}`, {
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Graceful shutdown protocol
  const shutdown = (signal: string) => {
    serverLogger.info(`Received ${signal} event signal. Initiating graceful shutdown sequence...`);
    server.close(() => {
      serverLogger.info('ClearPath server HTTP listener closed and connections drained.');
      process.exit(0);
    });

    // Hard emergency cutoff in 10 seconds
    setTimeout(() => {
      serverLogger.error('Force shutting down Express process due to unresponsive open handles.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  serverLogger.error('Encountered crash condition while booting full-stack server', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
