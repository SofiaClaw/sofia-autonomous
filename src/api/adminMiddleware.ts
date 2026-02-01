/**
 * Admin API Middleware
 * Handles authentication and authorization for admin endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { secureCompare } from '../utils/helpers';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        authenticated: boolean;
        timestamp: number;
      };
    }
  }
}

/**
 * Admin authentication middleware
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-admin-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  
  if (!apiKey) {
    logger.warn('Admin API access attempted without API key', {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin API key required',
    });
    return;
  }

  const validKey = process.env.ADMIN_API_KEY;
  
  if (!validKey) {
    logger.error('ADMIN_API_KEY not configured');
    res.status(500).json({
      error: 'Server Error',
      message: 'Admin authentication not configured',
    });
    return;
  }

  if (!secureCompare(apiKey as string, validKey)) {
    logger.warn('Admin API access attempted with invalid API key', {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  // Attach admin context to request
  req.adminUser = {
    authenticated: true,
    timestamp: Date.now(),
  };

  next();
}

/**
 * Rate limiting for admin endpoints
 * Simple in-memory rate limiter
 */
const rateLimits = new Map<string, { count: number; resetTime: number }>();

export function adminRateLimit(
  maxRequests: number = 100,
  windowMs: number = 60 * 1000 // 1 minute
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    const limit = rateLimits.get(key);
    
    if (!limit || now > limit.resetTime) {
      // New window
      rateLimits.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (limit.count >= maxRequests) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded for admin API',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000),
      });
      return;
    }

    limit.count++;
    next();
  };
}

/**
 * Request logging middleware for admin endpoints
 */
export function adminRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Admin API request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });

  next();
}

/**
 * Validate admin request body
 */
export function validateAdminBody(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: result.error.errors.map((e: any) => e.message).join(', '),
        });
        return;
      }
      next();
    } catch (error) {
      res.status(400).json({
        error: 'Validation Error',
        message: (error as Error).message,
      });
    }
  };
}