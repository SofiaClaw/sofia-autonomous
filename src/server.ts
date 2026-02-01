/**
 * SOFIA Autonomous Server
 * Main Express application entry point
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { createAdminRouter } from './api/adminRoutes';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Convex client placeholder - will be properly initialized
// In production, use the actual Convex client
const convexClient = {
  mutation: async (name: string, args: any) => {
    logger.debug('Convex mutation', { name, args });
    // Placeholder - implement with actual Convex client
    return { _id: 'mock_id' };
  },
  query: async (name: string, args: any) => {
    logger.debug('Convex query', { name, args });
    // Placeholder - implement with actual Convex client
    return [];
  },
};

export function createServer() {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for API
  }));
  
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-API-Key'],
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  });

  // Health check endpoint (public)
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'sofia-autonomous',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes
  app.use('/admin', createAdminRouter(convexClient as any));

  // Webhook endpoints for GitHub
  app.post('/webhooks/github', async (req: Request, res: Response) => {
    try {
      const event = req.headers['x-github-event'];
      const payload = req.body;

      logger.info('GitHub webhook received', { event });

      // Handle different GitHub events
      switch (event) {
        case 'issues':
          if (payload.action === 'opened') {
            // Create task from new issue
            // Implementation depends on TaskManager integration
            logger.info('New GitHub issue', { 
              issueNumber: payload.issue.number,
              title: payload.issue.title,
            });
          }
          break;

        case 'pull_request':
          if (payload.action === 'opened' || payload.action === 'synchronize') {
            logger.info('Pull request update', {
              prNumber: payload.pull_request.number,
              action: payload.action,
            });
          }
          break;

        case 'push':
          logger.info('Push event', {
            branch: payload.ref,
            commits: payload.commits?.length,
          });
          break;

        default:
          logger.debug('Unhandled GitHub event', { event });
      }

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('GitHub webhook error', { error });
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Webhook endpoint for Mission Control
  app.post('/webhooks/mission-control', async (req: Request, res: Response) => {
    try {
      const { type, payload } = req.body;

      logger.info('Mission Control webhook received', { type });

      // Process Mission Control events
      // Implementation depends on MissionControlService integration

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Mission Control webhook error', { error });
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    });
  });

  return app;
}

// Start server if not imported as module
if (require.main === module) {
  const app = createServer();
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    logger.info(`SOFIA Autonomous Server running on port ${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
    });
  });
}

export default createServer;