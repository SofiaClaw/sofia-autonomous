/**
 * Mission Control Monitoring Service
 * Monitors for new tasks, events, and system triggers
 */

import axios from 'axios';
import { MissionControlEvent } from '../types';
import { logger } from '../utils/logger';

interface ConvexClient {
  mutation: (name: string, args: any) => Promise<any>;
  query: (name: string, args: any) => Promise<any>;
}

export class MissionControlService {
  private convex: ConvexClient;
  private baseUrl: string;
  private apiKey: string;
  private isMonitoring: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(convex: ConvexClient) {
    this.convex = convex;
    this.baseUrl = process.env.MISSION_CONTROL_URL || 'https://mission-control.openclaw.io';
    this.apiKey = process.env.MISSION_CONTROL_API_KEY || '';
  }

  /**
   * Start monitoring Mission Control for events
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Mission Control monitoring already active');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting Mission Control monitoring', { intervalMs });

    // Initial check
    await this.checkForEvents();

    // Set up polling
    this.pollInterval = setInterval(async () => {
      try {
        await this.checkForEvents();
      } catch (error) {
        logger.error('Error checking Mission Control events', { error });
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Mission Control monitoring stopped');
  }

  /**
   * Check for new events from Mission Control
   */
  private async checkForEvents(): Promise<void> {
    try {
      // Get last processed event timestamp
      const lastProcessed = await this.convex.query('events:lastProcessed', {});
      const since = lastProcessed?.timestamp || Date.now() - 24 * 60 * 60 * 1000; // Default to 24h ago

      // Fetch events from Mission Control
      const response = await axios.get(
        `${this.baseUrl}/api/events`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          params: { since },
          timeout: 10000,
        }
      );

      const events: MissionControlEvent[] = response.data.events || [];

      for (const event of events) {
        await this.processEvent(event);
      }

      if (events.length > 0) {
        logger.info('Processed Mission Control events', { count: events.length });
      }
    } catch (error) {
      // Don't log errors for expected cases (e.g., no events)
      if (axios.isAxiosError(error) && error.response?.status !== 404) {
        logger.error('Failed to check Mission Control events', { error });
      }
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: MissionControlEvent): Promise<void> {
    logger.debug('Processing Mission Control event', { 
      eventId: event.id, 
      type: event.type 
    });

    switch (event.type) {
      case 'task_created':
        await this.handleTaskCreated(event);
        break;
      
      case 'task_updated':
        await this.handleTaskUpdated(event);
        break;
      
      case 'agent_spawned':
        await this.handleAgentSpawned(event);
        break;
      
      case 'deployment_requested':
        await this.handleDeploymentRequested(event);
        break;
      
      default:
        logger.warn('Unknown event type', { type: event.type, eventId: event.id });
    }

    // Mark event as processed
    await this.convex.mutation('events:markProcessed', {
      eventId: event.id,
      timestamp: event.timestamp,
    });
  }

  /**
   * Handle task_created event
   */
  private async handleTaskCreated(event: MissionControlEvent): Promise<void> {
    const { title, description, type, priority, source } = event.payload;

    logger.info('New task from Mission Control', { 
      title, 
      type, 
      priority,
      source,
    });

    // Create task in SOFIA
    await this.convex.mutation('tasks:create', {
      id: `task_${Date.now()}`,
      title,
      description,
      type: type || 'code',
      status: 'pending',
      priority: priority || 'medium',
      createdBy: source || 'mission-control',
      progress: 0,
      tags: ['mission-control', source].filter(Boolean),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Handle task_updated event
   */
  private async handleTaskUpdated(event: MissionControlEvent): Promise<void> {
    const { taskId, updates } = event.payload;

    logger.info('Task update from Mission Control', { taskId, updates });

    // Update task in SOFIA
    await this.convex.mutation('tasks:update', {
      id: taskId,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  /**
   * Handle agent_spawned event
   */
  private async handleAgentSpawned(event: MissionControlEvent): Promise<void> {
    const { agentName, capabilities } = event.payload;

    logger.info('Agent spawn request from Mission Control', { 
      agentName, 
      capabilities 
    });

    // This would trigger agent registration
    // Implementation depends on how you want to handle external agent requests
  }

  /**
   * Handle deployment_requested event
   */
  private async handleDeploymentRequested(event: MissionControlEvent): Promise<void> {
    const { environment, commitSha, triggeredBy } = event.payload;

    logger.info('Deployment requested from Mission Control', { 
      environment, 
      commitSha,
      triggeredBy,
    });

    // Create a deployment task
    await this.convex.mutation('tasks:create', {
      id: `deploy_${Date.now()}`,
      title: `Deploy to ${environment}`,
      description: `Deployment requested by ${triggeredBy}\nCommit: ${commitSha}`,
      type: 'deploy',
      status: 'pending',
      priority: 'high',
      createdBy: 'mission-control',
      progress: 0,
      tags: ['deployment', environment],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Trigger deployment
    await this.triggerDeployment(environment, commitSha);
  }

  /**
   * Trigger a deployment
   */
  private async triggerDeployment(environment: string, commitSha: string): Promise<void> {
    try {
      // In production, this would integrate with your deployment system
      // For now, we'll just log it
      logger.info('Deployment triggered', { environment, commitSha });

      // Update deployment status
      await this.convex.mutation('deployments:create', {
        id: `deploy_${Date.now()}`,
        environment,
        commitSha,
        status: 'pending',
        triggeredBy: 'mission-control',
        startedAt: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to trigger deployment', { error, environment, commitSha });
      throw error;
    }
  }

  /**
   * Send status update to Mission Control
   */
  async sendStatusUpdate(status: {
    agents: number;
    activeTasks: number;
    pendingTasks: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  }): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/api/status`,
        {
          source: 'sofia-autonomous',
          timestamp: Date.now(),
          ...status,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      logger.error('Failed to send status update', { error });
    }
  }

  /**
   * Report task completion to Mission Control
   */
  async reportTaskCompletion(
    taskId: string,
    success: boolean,
    result?: string
  ): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/api/tasks/report`,
        {
          taskId,
          success,
          result,
          completedAt: Date.now(),
          source: 'sofia-autonomous',
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      logger.error('Failed to report task completion', { error, taskId });
    }
  }

  /**
   * Check Mission Control health
   */
  async healthCheck(): Promise<{ connected: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await axios.get(
        `${this.baseUrl}/health`,
        { timeout: 5000 }
      );

      return {
        connected: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        connected: false,
        latency: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }
}