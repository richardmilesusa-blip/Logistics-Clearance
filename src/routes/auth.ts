import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-security-key-signature-256-bit';

/**
 * POST /api/auth/login
 * Validates user credentials and returns a JWT token if successful.
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Email and password are both required.'
      }
    });
    return;
  }

  try {
    // Check credentials against the database user registry
    const userRes = await query('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase().trim()]);
    
    if (userRes.rowCount === 0) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Invalid institutional credentials or security creed.'
        }
      });
      return;
    }

    const user = userRes.rows[0];
    
    // Verify password hash integrity
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: {
          message: 'Invalid institutional credentials or security creed.'
        }
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Your account has been deactivated. Please contact an administrator.'
        }
      });
      return;
    }

    // Generate authenticated signed JWT payload token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active
        },
        token
      }
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;
