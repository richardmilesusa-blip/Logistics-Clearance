import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { handleError } from './middleware/errorHandler';

const app = express();

// Express app level Winston configuration
const appLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Primary Middleware: Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false // Disabled for Vite hot reload support and simple preview embedding
}));

// Primary Middleware: CORS
app.use(cors({
  origin: true, // Allow all origins in dev preview for easy connectivity
  credentials: true
}));

// Rate Limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests received from this client. Please slow down and try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// JSON Body Parser with 10MB limit (requested to handle large document data/uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trace log each request
app.use((req, res, next) => {
  appLogger.info('Received HTTP request', {
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  next();
});

// A. Health check endpoints
import healthRouter from './routes/health';
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

// B. Base API V1 Route Mounts (Routers are placeholder empty express.Routers for now)
import jobsRouter from './routes/jobs';
import dutyAssessmentsRouter from './routes/dutyAssessments';
import notificationsRouter from './routes/notifications';
import documentsRouter from './routes/documents';
import complianceRouter from './routes/compliance';
import operationsRouter from './routes/operations';
import reportsRouter from './routes/reports';
import clientsRouter from './routes/clients';

const baseRouter = express.Router();

baseRouter.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ClearPath SaaS API. Core services are active.',
    version: '1.0.0'
  });
});

// Mount V1 API
app.use('/api', baseRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/jobs', dutyAssessmentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/jobs', documentsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/jobs', complianceRouter);
app.use('/api/jobs', operationsRouter);
app.use('/api/reports', reportsRouter);

// C. Error Handler Middleware (MUST be registered last)
app.use(handleError);

export default app;
