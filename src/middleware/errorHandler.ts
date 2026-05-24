import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import winston from 'winston';

const errorLogger = winston.createLogger({
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
 * Global Error Handler Middleware.
 * Standardizes API responses on validation issues, authorization flags, or server crashes.
 */
export function handleError(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log all system errors
  errorLogger.error('Express Request execution encountered error', {
    method: req.method,
    url: req.url,
    error: err.message || err,
    stack: err.stack
  });

  // 1. Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request body or input parameters failed validation checks.',
        details: err.flatten().fieldErrors
      }
    });
    return;
  }

  // 2. Handle JWT authorization errors
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: err.message || 'Access token is invalid or expired.'
      }
    });
    return;
  }

  // 3. Handle PostgreSQL errors (Conflict / Unique violation: code '23505')
  if (err.code === '23505') {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT_ERROR',
        message: 'A record containing unique values already exists inside the database.',
        details: err.detail || undefined
      }
    });
    return;
  }

  // 4. Handle standard 400 bad requests or manually thrown generic API errors
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected server error occurred. Please try again later.';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details: err.details || undefined
    }
  });
}
