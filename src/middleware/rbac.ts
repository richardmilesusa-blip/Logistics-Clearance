import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

export type UserRole = 'customs_broker' | 'freight_forwarder' | 'senior_admin' | 'viewer';

/**
 * Role-Based Access Control Factory.
 * Checks if the logged-in user possesses one of the allowed roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required for this action.'
        }
      });
      return;
    }

    const { role } = req.user;

    if (!allowedRoles.includes(role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. You do not have permission to perform this actions. Required roles: [${allowedRoles.join(', ')}].`
        }
      });
      return;
    }

    next();
  };
}
