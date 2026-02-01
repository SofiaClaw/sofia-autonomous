/**
 * Admin API Routes
 * Provides admin endpoints for task queue, agent monitoring, and deployment
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { adminAuth, adminRateLimit, validateAdminBody } from './adminMiddleware';
import { TaskManager } from '../services/taskManager';
import { AgentService } from '../services/agentService';
import { ReportingService } from '../services/reportingService';
import { GitHubService } from '../services/github';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';
import { TaskType } from '../types';

interface ConvexClient {
  mutation: (name: string, args: any) => Promise<any>;
  query: (name: string, args: any) => Promise<any>;
}

export function createAdminRouter(convex: ConvexClient): Router {
  const router = Router();
  const taskManager = new TaskManager(convex);
  const agentService = new AgentService(convex);
  const reportingService = new ReportingService(convex);
  const github = new GitHubService();

  // Apply middleware to all routes
  router.use(adminAuth);
  router.use(adminRateLimit(100, 60 * 1000)); // 100 requests per minute

  // ======== STATS ENDPOINTS ========

  /**
   * GET /admin/stats
   * Get system-wide statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const [agentStats, tasks, sessions, deployments] = await Promise.all([
        agentService.getSystemStats(),
        Promise.all([
          taskManager.getTasksByStatus('pending'),
          taskManager.getTasksByStatus('in_progress'),
          taskManager.getTasksByStatus('completed'),
          taskManager.getTasksByStatus('failed'),
        ]),
        convex.query('sessions:listActive', {}),
        convex.query('deployments:listRecent', { limit: 5 }),
      ]);

      const [pending, inProgress, completed, failed] = tasks;

      res.json({
        success: true,
        data: {
          agents: agentStats,
          tasks: {
            total: pending.length + inProgress.length + completed.length + failed.length,
            pending: pending.length,
            inProgress: inProgress.length,
            completedToday: completed.filter(t => {
              const today = new Date();
              const completedDate = t.completedAt ? new Date(t.completedAt) : null;
              return completedDate && 
                completedDate.getDate() === today.getDate() &&
                completedDate.getMonth() === today.getMonth() &&
                completedDate.getFullYear() === today.getFullYear();
            }).length,
            failedToday: failed.filter(t => {
              const today = new Date();
              const failedDate = t.updatedAt ? new Date(t.updatedAt) : null;
              return failedDate && 
                failedDate.getDate() === today.getDate() &&
                failedDate.getMonth() === today.getMonth() &&
                failedDate.getFullYear() === today.getFullYear();
            }).length,
          },
          sessions: {
            active: sessions.length,
          },
          system: {
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            lastDeployment: deployments[0]?.startedAt || null,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get stats', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // ======== TASK QUEUE ENDPOINTS ========

  /**
   * GET /admin/tasks
   * List tasks with optional filtering
   */
  router.get('/tasks', async (req: Request, res: Response) => {
    try {
      const { status, limit = '50', offset = '0' } = req.query;

      let tasks;
      if (status) {
        tasks = await taskManager.getTasksByStatus(status as any);
      } else {
        tasks = await convex.query('tasks:list', { 
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        });
      }

      res.json({
        success: true,
        data: tasks,
        meta: {
          total: tasks.length,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      logger.error('Failed to list tasks', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /admin/tasks
   * Create a new task
   */
  const createTaskSchema = z.object({
    title: z.string().min(3),
    description: z.string().min(10),
    type: z.enum(['code', 'bugfix', 'review', 'deploy', 'research', 'documentation', 'test', 'maintenance']),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    autoAssign: z.boolean().default(true),
    tags: z.array(z.string()).optional(),
    estimatedHours: z.number().optional(),
  });

  router.post('/tasks', validateAdminBody(createTaskSchema), async (req: Request, res: Response) => {
    try {
      const { title, description, type, priority, autoAssign, tags, estimatedHours } = req.body;

      const task = await taskManager.createTask(
        title,
        description,
        type as TaskType,
        priority,
        {
          createdBy: 'admin',
          autoAssign,
          tags,
          estimatedHours,
        }
      );

      res.status(201).json({
        success: true,
        data: task,
        message: 'Task created successfully',
      });
    } catch (error) {
      logger.error('Failed to create task', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /admin/tasks/:id/cancel
   * Cancel a task
   */
  router.post('/tasks/:id/cancel', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      await taskManager.cancelTask(id, reason);

      res.json({
        success: true,
        message: 'Task cancelled successfully',
      });
    } catch (error) {
      logger.error('Failed to cancel task', { error, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /admin/tasks/process-next
   * Trigger processing of next pending task
   */
  router.post('/tasks/process-next', async (req: Request, res: Response) => {
    try {
      await taskManager.processNextTask();

      res.json({
        success: true,
        message: 'Processing next task',
      });
    } catch (error) {
      logger.error('Failed to process next task', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // ======== AGENT ENDPOINTS ========

  /**
   * GET /admin/agents
   * List all agents
   */
  router.get('/agents', async (req: Request, res: Response) => {
    try {
      const agents = await agentService.listAgents();

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      logger.error('Failed to list agents', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /admin/agents/:id
   * Get agent details
   */
  router.get('/agents/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [agent, metrics] = await Promise.all([
        agentService.getAgent(id),
        agentService.getAgentMetrics(id),
      ]);

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...agent,
          metrics,
        },
      });
    } catch (error) {
      logger.error('Failed to get agent', { error, agentId: req.params.id });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /admin/agents/:id/status
   * Update agent status
   */
  router.post('/agents/:id/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await agentService.updateAgentStatus(id, status);

      res.json({
        success: true,
        message: 'Agent status updated',
      });
    } catch (error) {
      logger.error('Failed to update agent status', { error, agentId: req.params.id });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // ======== DEPLOYMENT ENDPOINTS ========

  /**
   * POST /admin/deploy
   * Trigger a deployment
   */
  const deploySchema = z.object({
    environment: z.enum(['staging', 'production']),
    commitSha: z.string().optional(),
    branch: z.string().optional(),
  });

  router.post('/deploy', validateAdminBody(deploySchema), async (req: Request, res: Response) => {
    try {
      const { environment, commitSha, branch } = req.body;

      // Get latest commit if not specified
      let targetCommit = commitSha;
      if (!targetCommit && branch) {
        const commits = await github.getCommits(branch);
        targetCommit = commits[0]?.sha;
      }

      if (!targetCommit) {
        res.status(400).json({
          success: false,
          error: 'No commit SHA or branch specified',
        });
        return;
      }

      // Create deployment task
      const deployTask = await taskManager.createTask(
        `Deploy to ${environment}`,
        `Manual deployment triggered via admin API\nCommit: ${targetCommit}\nEnvironment: ${environment}`,
        'deploy',
        'high',
        {
          createdBy: 'admin',
          autoAssign: true,
          tags: ['deployment', environment, 'manual'],
        }
      );

      // Record deployment
      await convex.mutation('deployments:create', {
        id: generateId('deploy'),
        environment,
        commitSha: targetCommit,
        status: 'pending',
        triggeredBy: 'admin-api',
        taskId: deployTask.id,
        startedAt: Date.now(),
      });

      res.json({
        success: true,
        data: {
          deploymentId: deployTask.id,
          environment,
          commitSha: targetCommit,
          status: 'pending',
        },
        message: 'Deployment triggered',
      });
    } catch (error) {
      logger.error('Failed to trigger deployment', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /admin/deployments
   * List recent deployments
   */
  router.get('/deployments', async (req: Request, res: Response) => {
    try {
      const { limit = '10' } = req.query;
      const deployments = await convex.query('deployments:listRecent', {
        limit: parseInt(limit as string),
      });

      res.json({
        success: true,
        data: deployments,
      });
    } catch (error) {
      logger.error('Failed to list deployments', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // ======== REPORTING ENDPOINTS ========

  /**
   * GET /admin/standup
   * Get daily standup
   */
  router.get('/standup', async (req: Request, res: Response) => {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();

      const standup = await reportingService.generateDailyStandup(targetDate);

      res.json({
        success: true,
        data: standup,
      });
    } catch (error) {
      logger.error('Failed to generate standup', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /admin/metrics
   * Get performance metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();

      const metrics = await reportingService.generatePerformanceMetrics(targetDate);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to generate metrics', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /admin/suggestions
   * Generate proactive task suggestions
   */
  router.post('/suggestions', async (req: Request, res: Response) => {
    try {
      const suggestions = await reportingService.generateTaskSuggestions();

      res.json({
        success: true,
        data: suggestions,
        message: `${suggestions.length} suggestions generated`,
      });
    } catch (error) {
      logger.error('Failed to generate suggestions', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // ======== HEALTH CHECK ========

  /**
   * GET /admin/health
   * Admin health check endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        version: process.env.npm_package_version || '1.0.0',
      },
    });
  });

  return router;
}